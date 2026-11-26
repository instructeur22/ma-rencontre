import express from 'express';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { config } from '../config.js';
import { getDb } from '../db/database.js';
import { requireAuth, signAuthToken } from '../middleware/auth.js';
import { creditCauris, getEffectiveSubscriptionTier } from '../services/monetizationService.js';
import { computeTrustScore } from '../services/antiScamService.js';
import { requestWhatsAppOtp, verifyWhatsAppOtp } from '../services/whatsappOtpService.js';
import {
  ABIDJAN_COMMUNES,
  AVATAR_PRESETS,
  CI_CITIES,
  DIASPORA_HUBS,
  VRAI_BABI_QUESTIONS,
  computeTrustBreakdown,
  parseJsonSafe,
} from '../services/matchingService.js';

const router = express.Router();
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function formatSelfUser(row) {
  return {
    id: row.id,
    email: row.email,
    phone: row.phone,
    phoneVerified: Boolean(row.phone_verified),
    name: row.name,
    age: row.age,
    gender: row.gender,
    lookingFor: row.looking_for,
    commune: row.commune,
    city: row.city,
    countryCode: row.country_code,
    isDiaspora: Boolean(row.is_diaspora),
    passportActive: Boolean(row.passport_active),
    passportTargetCity: row.passport_target_city || '',
    passportArrivalDate: row.passport_arrival_date || '',
    passportDepartureDate: row.passport_departure_date || '',
    intention: row.intention,
    profession: row.profession,
    bio: row.bio,
    secretPrompt: row.secret_prompt,
    avatarUrl: row.avatar_url,
    voiceNoteUrl: row.voice_note_url || '',
    voiceDurationSec: row.voice_duration_sec || 0,
    tags: parseJsonSafe(row.tags_json, []),
    vraiBabi: parseJsonSafe(row.vrai_babi_json, {}),
    tonightAvailable: Boolean(row.tonight_available),
    tonightMood: row.tonight_mood,
    incognito: Boolean(row.incognito),
    verified225: Boolean(row.verified_225),
    trustScore: row.trust_score,
    trustBreakdown: computeTrustBreakdown(row),
    caurisBalance: row.cauris_balance,
    subscriptionTier: getEffectiveSubscriptionTier(row),
    subscriptionExpiresAt: row.subscription_expires_at,
    boostExpiresAt: row.boost_expires_at,
    referralCode: row.referral_code,
    checkinStreak: row.checkin_streak,
    lastCheckinDate: row.last_checkin_date,
  };
}

router.post('/register', (req, res) => {
  const {
    email,
    password,
    name,
    age,
    gender = 'man',
    lookingFor = 'women',
    commune = 'Cocody • Riviera',
    city = 'Abidjan',
    intention = 'Relation sérieuse',
    phone = '',
    referralCodeUsed = '',
  } = req.body || {};

  if (!email || !password || !name || age === undefined || age === null) {
    return res.status(422).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Email, mot de passe, prénom et âge sont requis.' },
    });
  }
  const cleanEmail = String(email).trim().toLowerCase();
  if (!EMAIL_REGEX.test(cleanEmail)) {
    return res.status(422).json({
      success: false,
      error: { code: 'INVALID_EMAIL', message: 'Format d’adresse email invalide.' },
    });
  }
  if (String(password).length < 8) {
    return res.status(422).json({
      success: false,
      error: { code: 'WEAK_PASSWORD', message: 'Le mot de passe doit contenir au moins 8 caractères.' },
    });
  }
  const numericAge = Number(age);
  if (!Number.isInteger(numericAge) || numericAge < 18 || numericAge > 100) {
    return res.status(422).json({
      success: false,
      error: { code: 'AGE_RESTRICTED', message: 'AKWABA est strictement réservé aux personnes majeures (18+).' },
    });
  }
  const safeGender = ['man', 'woman', 'nonbinary'].includes(gender) ? gender : 'man';
  const normalizedLooking = lookingFor === 'all' ? 'everyone' : lookingFor;
  const safeLookingFor = ['men', 'women', 'everyone'].includes(normalizedLooking) ? normalizedLooking : 'women';
  const cleanName = String(name).trim().slice(0, 80);
  if (!cleanName) {
    return res.status(422).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Le prénom ne peut pas être vide.' },
    });
  }

  const db = getDb();
  const existing = db.prepare('SELECT id FROM users WHERE lower(email) = lower(?)').get(cleanEmail);
  if (existing) {
    return res.status(409).json({
      success: false,
      error: { code: 'EMAIL_EXISTS', message: 'Un compte existe déjà avec cet email.' },
    });
  }

  const id = `usr_${crypto.randomUUID().slice(0, 10)}`;
  const passwordHash = bcrypt.hashSync(String(password), 10);
  const cleanCode = `AKW-${cleanName.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 5) || 'BABI'}${crypto.randomInt(100, 999)}`;
  const isDiaspora = DIASPORA_HUBS.includes(commune) || DIASPORA_HUBS.includes(city) ? 1 : 0;
  const avatarUrl = safeGender === 'woman' ? '/assets/profiles/aya.jpg' : '/assets/profiles/kouame.jpg';

  db.prepare(
    `INSERT INTO users (
      id, email, phone, password_hash, name, age, gender, looking_for,
      commune, city, country_code, is_diaspora, intention, bio, avatar_url,
      cauris_balance, referral_code, trust_score
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 50)`
  ).run(
    id,
    cleanEmail,
    String(phone).trim().slice(0, 24),
    passwordHash,
    cleanName,
    numericAge,
    safeGender,
    safeLookingFor,
    String(commune).slice(0, 80),
    String(city).slice(0, 80),
    isDiaspora ? 'FR' : 'CI',
    isDiaspora,
    String(intention).slice(0, 80),
    `Nouveau membre sur AKWABA à ${String(commune).slice(0, 80)}.`,
    avatarUrl,
    cleanCode
  );

  creditCauris(db, id, 50, 'Bonus de bienvenue AKWABA', 'WELCOME-50');

  if (referralCodeUsed && String(referralCodeUsed).trim()) {
    const sponsor = db.prepare('SELECT id FROM users WHERE referral_code = ?').get(String(referralCodeUsed).trim().toUpperCase());
    if (sponsor && sponsor.id !== id) {
      db.prepare('UPDATE users SET referred_by = ? WHERE id = ?').run(sponsor.id, id);
      creditCauris(db, sponsor.id, 100, `Parrainage de ${cleanName}`, `REF-${id}`);
      creditCauris(db, id, 50, 'Bonus code parrain', `REF-BONUS-${sponsor.id}`);
    }
  }

  computeTrustScore(db, id);
  const created = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  const token = signAuthToken(id);

  return res.status(201).json({
    success: true,
    data: {
      token,
      user: formatSelfUser(created),
    },
  });
});

router.post('/login', (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(422).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Email et mot de passe requis.' },
    });
  }

  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE lower(email) = lower(?)').get(String(email).trim());
  if (!user || !bcrypt.compareSync(String(password), user.password_hash)) {
    return res.status(401).json({
      success: false,
      error: { code: 'INVALID_CREDENTIALS', message: 'Identifiants incorrects.' },
    });
  }

  const token = signAuthToken(user.id);
  return res.json({
    success: true,
    data: {
      token,
      user: formatSelfUser(user),
    },
  });
});

router.post('/demo', (req, res) => {
  if (!config.allowDemoLogin) {
    return res.status(403).json({
      success: false,
      error: { code: 'DEMO_DISABLED', message: 'Connexion démo désactivée en production.' },
    });
  }
  const { persona = 'kouame' } = req.body || {};
  const targetId = persona === 'aya' ? 'usr_aya' : 'usr_kouame';
  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(targetId);
  if (!user) {
    return res.status(404).json({ success: false, error: { code: 'DEMO_NOT_SEEDED', message: 'Profil démo introuvable.' } });
  }
  const token = signAuthToken(user.id);
  return res.json({
    success: true,
    data: {
      token,
      user: formatSelfUser(user),
    },
  });
});

router.get('/me', requireAuth, (req, res) => {
  return res.json({
    success: true,
    data: {
      user: formatSelfUser(req.user),
      meta: {
        communes: ABIDJAN_COMMUNES,
        cities: CI_CITIES,
        diasporaHubs: DIASPORA_HUBS,
        vraiBabiQuestions: VRAI_BABI_QUESTIONS,
        avatarPresets: AVATAR_PRESETS,
      },
    },
  });
});

router.post('/phone-otp/request', requireAuth, async (req, res) => {
  try {
    const { phone } = req.body || {};
    const db = getDb();
    const result = await requestWhatsAppOtp(db, req.user.id, phone);
    if (!result.ok) {
      return res.status(result.status).json({
        success: false,
        error: {
          code: result.code,
          message: result.message,
          ...(result.retryAfterSec ? { retryAfterSec: result.retryAfterSec } : {}),
        },
      });
    }
    return res.json({ success: true, data: result.data });
  } catch (err) {
    return res.status(502).json({
      success: false,
      error: { code: 'WHATSAPP_DELIVERY_FAILED', message: err.message },
    });
  }
});

router.post('/phone-otp/verify', requireAuth, (req, res) => {
  const { phone, code } = req.body || {};
  const db = getDb();
  const result = verifyWhatsAppOtp(db, req.user.id, phone, code);
  if (!result.ok) {
    return res.status(result.status).json({
      success: false,
      error: {
        code: result.code,
        message: result.message,
        ...(result.remainingAttempts !== undefined ? { remainingAttempts: result.remainingAttempts } : {}),
      },
    });
  }
  const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  return res.json({
    success: true,
    data: {
      ...result.data,
      user: formatSelfUser(updated),
    },
  });
});

// Hardened legacy route: now requires a valid 6-digit WhatsApp OTP code
router.post('/phone-verify', requireAuth, (req, res) => {
  const { phone, code } = req.body || {};
  const db = getDb();
  const result = verifyWhatsAppOtp(db, req.user.id, phone, code);
  if (!result.ok) {
    return res.status(result.status).json({
      success: false,
      error: { code: result.code, message: result.message },
    });
  }
  const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  return res.json({
    success: true,
    data: {
      ...result.data,
      user: formatSelfUser(updated),
    },
  });
});

export default router;
