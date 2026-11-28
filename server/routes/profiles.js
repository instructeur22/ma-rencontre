import express from 'express';
import crypto from 'node:crypto';
import { config } from '../config.js';
import { getDb } from '../db/database.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { formatSelfUser } from './auth.js';
import {
  computeCompatibility,
  matchesLookingFor,
  sanitizePublicProfile,
  DIASPORA_HUBS,
} from '../services/matchingService.js';
import { computeTrustScore, getBlockedUserIds } from '../services/antiScamService.js';
import { saveMediaFile } from '../services/mediaStorageService.js';
import { getEffectiveSubscriptionTier, spendCauris } from '../services/monetizationService.js';

const router = express.Router();
const MAX_VOICE_BYTES = 4 * 1024 * 1024;
const MAX_AVATAR_BYTES = 2 * 1024 * 1024;

function detectImageExtension(buffer, declaredMime = '') {
  if (!Buffer.isBuffer(buffer) || buffer.byteLength < 12) return null;
  if (declaredMime && !/^image\/(jpeg|jpg|png|webp)$/i.test(declaredMime.trim())) {
    return null;
  }
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
    return 'png';
  }
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'jpg';
  }
  if (buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') {
    return 'webp';
  }
  return null;
}

function isSafeAvatarUrl(url) {
  if (typeof url !== 'string') return false;
  const trimmed = url.trim();
  if (trimmed.includes('..')) return false;
  if (trimmed.startsWith('/assets/profiles/') || trimmed.startsWith('/uploads/avatars/')) {
    return /^\/(assets\/profiles|uploads\/avatars)\/[a-zA-Z0-9._-]+$/.test(trimmed);
  }
  if (config.nodeEnv === 'production') {
    return false;
  }
  if (trimmed.startsWith('/assets/') || trimmed.startsWith('/uploads/')) {
    return true;
  }
  return /^https?:\/\/[^\s"'<>]+$/i.test(trimmed);
}

router.get('/discover', requireAuth, asyncHandler(async (req, res) => {
  const db = getDb();
  const viewer = req.user;
  const {
    commune = 'all',
    intention = 'all',
    verifiedOnly = 'false',
    onlineOnly = 'false',
    diasporaOnly = 'false',
    includeSwiped = 'false',
  } = req.query;

  const blockedIds = await getBlockedUserIds(db, viewer.id);
  const swipedRows = await db.all('SELECT target_id FROM swipes WHERE actor_id = ?', viewer.id);
  const swipedIds = new Set(swipedRows.map((r) => r.target_id));

  const incomingLikeRows = await db.all(
    "SELECT actor_id FROM swipes WHERE target_id = ? AND action IN ('like', 'super_like')",
    viewer.id
  );
  const likedViewerIds = new Set(incomingLikeRows.map((r) => r.actor_id));

  const allCandidates = await db.all('SELECT * FROM users WHERE id != ?', viewer.id);

  const filtered = allCandidates
    .filter((cand) => {
      if (blockedIds.has(cand.id)) return false;
      if (includeSwiped !== 'true' && swipedIds.has(cand.id)) return false;
      if (cand.incognito && !likedViewerIds.has(cand.id)) return false;
      if (!matchesLookingFor(viewer, cand)) return false;
      if (commune !== 'all' && cand.commune !== commune && cand.city !== commune && cand.passport_target_city !== commune) {
        return false;
      }
      if (intention !== 'all' && cand.intention !== intention) return false;
      if (verifiedOnly === 'true' && !cand.verified_225) return false;
      if (onlineOnly === 'true' && !cand.online_status) return false;
      if (diasporaOnly === 'true' && !cand.is_diaspora && !cand.passport_active) return false;
      return true;
    })
    .map((cand) => sanitizePublicProfile(cand, viewer))
    .sort((a, b) => {
      if (a.hasBoost !== b.hasBoost) return a.hasBoost ? -1 : 1;
      return (b.compatibility?.score || 0) - (a.compatibility?.score || 0);
    });

  return res.json({
    success: true,
    data: {
      profiles: filtered,
      total: filtered.length,
    },
  });
}));

router.get('/tonight', requireAuth, asyncHandler(async (req, res) => {
  const db = getDb();
  const viewer = req.user;
  const blockedIds = await getBlockedUserIds(db, viewer.id);
  const allCandidates = await db.all('SELECT * FROM users WHERE id != ? AND tonight_available = 1', viewer.id);

  const list = allCandidates
    .filter((c) => !blockedIds.has(c.id) && matchesLookingFor(viewer, c))
    .map((c) => sanitizePublicProfile(c, viewer))
    .sort((a, b) => (b.compatibility?.score || 0) - (a.compatibility?.score || 0));

  return res.json({
    success: true,
    data: { profiles: list },
  });
}));

router.get('/:id', requireAuth, asyncHandler(async (req, res) => {
  const db = getDb();
  const blockedIds = await getBlockedUserIds(db, req.user.id);
  if (blockedIds.has(req.params.id)) {
    return res.status(404).json({ success: false, error: { code: 'PROFILE_NOT_FOUND', message: 'Profil introuvable.' } });
  }
  const target = await db.get('SELECT * FROM users WHERE id = ?', req.params.id);
  if (!target) {
    return res.status(404).json({ success: false, error: { code: 'PROFILE_NOT_FOUND', message: 'Profil introuvable.' } });
  }
  return res.json({
    success: true,
    data: {
      profile: sanitizePublicProfile(target, req.user),
      compatibility: computeCompatibility(req.user, target),
    },
  });
}));

router.put('/me', requireAuth, asyncHandler(async (req, res) => {
  const db = getDb();
  const current = req.user;
  const {
    name,
    age,
    gender,
    lookingFor,
    commune,
    city,
    intention,
    profession,
    bio,
    secretPrompt,
    avatarUrl,
    tags,
    vraiBabi,
    tonightAvailable,
    tonightMood,
  } = req.body || {};

  if (age !== undefined) {
    const numericAge = Number(age);
    if (!Number.isInteger(numericAge) || numericAge < 18 || numericAge > 100) {
      return res.status(422).json({
        success: false,
        error: { code: 'AGE_RESTRICTED', message: 'L’âge doit être compris entre 18 et 100 ans.' },
      });
    }
  }

  if (avatarUrl !== undefined && !isSafeAvatarUrl(avatarUrl)) {
    return res.status(422).json({
      success: false,
      error: { code: 'INVALID_AVATAR_URL', message: 'URL d’avatar non autorisée.' },
    });
  }

  const nextName = String(name ?? current.name).trim().slice(0, 80) || current.name;
  const nextGender = gender && ['man', 'woman', 'nonbinary'].includes(gender) ? gender : current.gender;
  const normalizedLooking = lookingFor === 'all' ? 'everyone' : lookingFor;
  const nextLooking = normalizedLooking && ['men', 'women', 'everyone'].includes(normalizedLooking) ? normalizedLooking : current.looking_for;
  const nextCommune = String(commune ?? current.commune).slice(0, 80);
  const nextCity = String(city ?? current.city).slice(0, 80);
  const isDiaspora = DIASPORA_HUBS.includes(nextCommune) || DIASPORA_HUBS.includes(nextCity) ? 1 : 0;

  await db.run(
    `UPDATE users SET
      name = ?, age = ?, gender = ?, looking_for = ?, commune = ?, city = ?, is_diaspora = ?,
      intention = ?, profession = ?, bio = ?, secret_prompt = ?, avatar_url = ?,
      tags_json = ?, vrai_babi_json = ?, tonight_available = ?, tonight_mood = ?
     WHERE id = ?`,
    nextName,
    age !== undefined ? Number(age) : current.age,
    nextGender,
    nextLooking,
    nextCommune,
    nextCity,
    isDiaspora,
    String(intention ?? current.intention).slice(0, 80),
    String(profession ?? current.profession).slice(0, 100),
    String(bio ?? current.bio).slice(0, 1000),
    String(secretPrompt ?? current.secret_prompt).slice(0, 300),
    avatarUrl !== undefined ? avatarUrl.trim() : current.avatar_url,
    tags !== undefined && Array.isArray(tags) ? JSON.stringify(tags.slice(0, 12).map((t) => String(t).slice(0, 40))) : current.tags_json,
    vraiBabi !== undefined && typeof vraiBabi === 'object' && vraiBabi !== null ? JSON.stringify(vraiBabi) : current.vrai_babi_json,
    tonightAvailable !== undefined ? (tonightAvailable ? 1 : 0) : current.tonight_available,
    String(tonightMood ?? current.tonight_mood).slice(0, 140),
    current.id
  );

  await computeTrustScore(db, current.id);
  const updated = await db.get('SELECT * FROM users WHERE id = ?', current.id);
  return res.json({
    success: true,
    data: { user: formatSelfUser(updated) },
  });
}));

router.post('/me/voice', requireAuth, asyncHandler(async (req, res) => {
  const { audioBase64, mimeType = 'audio/webm', durationSec = 8 } = req.body || {};
  if (!audioBase64 || typeof audioBase64 !== 'string') {
    return res.status(422).json({
      success: false,
      error: { code: 'INVALID_AUDIO', message: 'Données audio manquantes.' },
    });
  }

  const base64Data = audioBase64.includes(',') ? audioBase64.split(',')[1] : audioBase64;
  const decoded = Buffer.from(base64Data, 'base64');
  if (decoded.byteLength === 0 || decoded.byteLength > MAX_VOICE_BYTES) {
    return res.status(decoded.byteLength > MAX_VOICE_BYTES ? 413 : 422).json({
      success: false,
      error: { code: 'INVALID_AUDIO_SIZE', message: 'Fichier vocal vide ou supérieur à 4 Mo.' },
    });
  }

  const ext = mimeType.includes('wav') ? 'wav' : mimeType.includes('mp4') || mimeType.includes('m4a') ? 'm4a' : 'webm';
  const filename = `${req.user.id}_${Date.now()}_${crypto.randomInt(100, 999)}.${ext}`;
  const voiceUrl = `/uploads/voices/${filename}`;
  const cleanMime = ext === 'wav' ? 'audio/wav' : ext === 'm4a' ? 'audio/mp4' : 'audio/webm';

  const db = getDb();
  await saveMediaFile(db, {
    mediaPath: voiceUrl,
    userId: req.user.id,
    mimeType: cleanMime,
    buffer: decoded,
    visibility: 'public',
  });

  await db.run(
    'UPDATE users SET voice_note_url = ?, voice_duration_sec = ? WHERE id = ?',
    voiceUrl,
    Math.max(1, Math.min(30, Number(durationSec) || 8)),
    req.user.id
  );

  const trustScore = await computeTrustScore(db, req.user.id);
  const updated = await db.get('SELECT * FROM users WHERE id = ?', req.user.id);

  return res.json({
    success: true,
    data: {
      voiceNoteUrl: voiceUrl,
      voiceDurationSec: updated.voice_duration_sec,
      trustScore,
      user: formatSelfUser(updated),
    },
  });
}));

router.post('/me/avatar', requireAuth, asyncHandler(async (req, res) => {
  const { imageBase64 } = req.body || {};
  if (!imageBase64 || typeof imageBase64 !== 'string') {
    return res.status(422).json({
      success: false,
      error: { code: 'INVALID_IMAGE', message: 'Image manquante.' },
    });
  }

  let declaredMime = '';
  let rawBase64 = imageBase64.trim();
  const dataUriMatch = rawBase64.match(/^data:([^;]+);base64,(.+)$/i);
  if (dataUriMatch) {
    declaredMime = dataUriMatch[1];
    rawBase64 = dataUriMatch[2];
  } else if (rawBase64.startsWith('data:')) {
    return res.status(422).json({
      success: false,
      error: { code: 'INVALID_IMAGE', message: 'Format data-URI image invalide.' },
    });
  }

  const decoded = Buffer.from(rawBase64, 'base64');
  if (decoded.byteLength > MAX_AVATAR_BYTES) {
    return res.status(413).json({
      success: false,
      error: { code: 'IMAGE_TOO_LARGE', message: 'Photo trop volumineuse (max 2 Mo).' },
    });
  }

  const ext = detectImageExtension(decoded, declaredMime);
  if (!ext) {
    return res.status(422).json({
      success: false,
      error: { code: 'INVALID_IMAGE', message: 'Format image invalide (JPEG, PNG ou WebP uniquement).' },
    });
  }

  const filename = `${req.user.id}_${Date.now()}_${crypto.randomInt(100, 999)}.${ext}`;
  const avatarUrl = `/uploads/avatars/${filename}`;
  const mimeType = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';

  const db = getDb();
  await saveMediaFile(db, {
    mediaPath: avatarUrl,
    userId: req.user.id,
    mimeType,
    buffer: decoded,
    visibility: 'public',
  });
  await db.run('UPDATE users SET avatar_url = ? WHERE id = ?', avatarUrl, req.user.id);
  const updated = await db.get('SELECT * FROM users WHERE id = ?', req.user.id);

  return res.json({
    success: true,
    data: {
      avatarUrl,
      user: formatSelfUser(updated),
    },
  });
}));

router.post('/me/passport', requireAuth, asyncHandler(async (req, res) => {
  const { active = true, targetCity = 'Abidjan', arrivalDate = '', departureDate = '' } = req.body || {};
  const db = getDb();
  const user = req.user;
  const tier = getEffectiveSubscriptionTier(user);

  if (active && tier !== 'diaspora_vip' && !user.passport_active) {
    const debit = await spendCauris(db, user.id, 200, `Activation Passeport Babi (${targetCity})`, 'PASSPORT-BABI');
    if (!debit.ok) {
      return res.status(402).json({
        success: false,
        error: {
          code: 'INSUFFICIENT_CAURIS',
          message: '200 Cauris requis pour le Passeport Babi (ou Pass Diaspora VIP).',
        },
      });
    }
  }

  await db.run(
    `UPDATE users SET passport_active = ?, passport_target_city = ?, passport_arrival_date = ?, passport_departure_date = ?
     WHERE id = ?`,
    active ? 1 : 0,
    String(targetCity).slice(0, 80),
    String(arrivalDate).slice(0, 32),
    String(departureDate).slice(0, 32),
    user.id
  );

  const updated = await db.get('SELECT * FROM users WHERE id = ?', user.id);
  return res.json({
    success: true,
    data: { user: formatSelfUser(updated) },
  });
}));

router.post('/me/incognito', requireAuth, asyncHandler(async (req, res) => {
  const db = getDb();
  const user = req.user;
  const tier = getEffectiveSubscriptionTier(user);
  const nextVal = user.incognito ? 0 : 1;

  if (nextVal === 1 && !['babi_gold', 'diaspora_vip'].includes(tier)) {
    const debit = await spendCauris(db, user.id, 200, 'Activation Mode Incognito 7 jours', 'INCOGNITO-7D');
    if (!debit.ok) {
      return res.status(402).json({
        success: false,
        error: {
          code: 'INSUFFICIENT_CAURIS',
          message: 'Le mode Incognito nécessite 200 Cauris ou un Pass Babi Gold / Diaspora VIP.',
        },
      });
    }
  }

  await db.run('UPDATE users SET incognito = ? WHERE id = ?', nextVal, user.id);
  const updated = await db.get('SELECT * FROM users WHERE id = ?', user.id);
  return res.json({
    success: true,
    data: { incognito: Boolean(nextVal), user: formatSelfUser(updated) },
  });
}));

router.post('/me/boost', requireAuth, asyncHandler(async (req, res) => {
  const db = getDb();
  const user = req.user;
  const debit = await spendCauris(db, user.id, 150, 'Boost Visibilité Tête d’affiche 24h', 'BOOST-24H');
  if (!debit.ok) {
    return res.status(402).json({
      success: false,
      error: {
        code: 'INSUFFICIENT_CAURIS',
        message: '150 Cauris requis pour activer le Boost 24h.',
      },
    });
  }
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  await db.run('UPDATE users SET boost_expires_at = ? WHERE id = ?', expiresAt, user.id);
  const updated = await db.get('SELECT * FROM users WHERE id = ?', user.id);
  return res.json({
    success: true,
    data: { boostExpiresAt: expiresAt, user: formatSelfUser(updated) },
  });
}));

export default router;
