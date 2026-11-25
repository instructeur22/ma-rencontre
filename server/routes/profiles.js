import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { config } from '../config.js';
import { getDb, normalizeRows } from '../db/database.js';
import { requireAuth } from '../middleware/auth.js';
import { formatSelfUser } from './auth.js';
import {
  computeCompatibility,
  matchesLookingFor,
  sanitizePublicProfile,
  DIASPORA_HUBS,
} from '../services/matchingService.js';
import { computeTrustScore, getBlockedUserIds } from '../services/antiScamService.js';
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
  if (trimmed.startsWith('/assets/') || trimmed.startsWith('/uploads/')) {
    return !trimmed.includes('..');
  }
  return /^https?:\/\/[^\s"'<>]+$/i.test(trimmed);
}

router.get('/discover', requireAuth, (req, res) => {
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

  const blockedIds = getBlockedUserIds(db, viewer.id);
  const swipedRows = db.prepare('SELECT target_id FROM swipes WHERE actor_id = ?').all(viewer.id);
  const swipedIds = new Set(swipedRows.map((r) => r.target_id));

  const allCandidates = normalizeRows(db.prepare('SELECT * FROM users WHERE id != ?').all(viewer.id));

  const filtered = allCandidates
    .filter((cand) => {
      if (blockedIds.has(cand.id)) return false;
      if (includeSwiped !== 'true' && swipedIds.has(cand.id)) return false;
      if (cand.incognito) {
        const likedViewer = db
          .prepare("SELECT 1 FROM swipes WHERE actor_id = ? AND target_id = ? AND action IN ('like', 'super_like')")
          .get(cand.id, viewer.id);
        if (!likedViewer) return false;
      }
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
});

router.get('/tonight', requireAuth, (req, res) => {
  const db = getDb();
  const viewer = req.user;
  const blockedIds = getBlockedUserIds(db, viewer.id);
  const allCandidates = normalizeRows(db.prepare('SELECT * FROM users WHERE id != ? AND tonight_available = 1').all(viewer.id));

  const list = allCandidates
    .filter((c) => !blockedIds.has(c.id) && matchesLookingFor(viewer, c))
    .map((c) => sanitizePublicProfile(c, viewer))
    .sort((a, b) => (b.compatibility?.score || 0) - (a.compatibility?.score || 0));

  return res.json({
    success: true,
    data: { profiles: list },
  });
});

router.get('/:id', requireAuth, (req, res) => {
  const db = getDb();
  const blockedIds = getBlockedUserIds(db, req.user.id);
  if (blockedIds.has(req.params.id)) {
    return res.status(404).json({ success: false, error: { code: 'PROFILE_NOT_FOUND', message: 'Profil introuvable.' } });
  }
  const target = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
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
});

router.put('/me', requireAuth, (req, res) => {
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

  db.prepare(
    `UPDATE users SET
      name = ?, age = ?, gender = ?, looking_for = ?, commune = ?, city = ?, is_diaspora = ?,
      intention = ?, profession = ?, bio = ?, secret_prompt = ?, avatar_url = ?,
      tags_json = ?, vrai_babi_json = ?, tonight_available = ?, tonight_mood = ?
     WHERE id = ?`
  ).run(
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

  computeTrustScore(db, current.id);
  const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(current.id);
  return res.json({
    success: true,
    data: { user: formatSelfUser(updated) },
  });
});

router.post('/me/voice', requireAuth, (req, res) => {
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
  const uploadDir = path.join(config.rootDir, 'public/uploads/voices');
  fs.mkdirSync(uploadDir, { recursive: true });
  fs.writeFileSync(path.join(uploadDir, filename), decoded);

  const voiceUrl = `/uploads/voices/${filename}`;
  const db = getDb();
  db.prepare('UPDATE users SET voice_note_url = ?, voice_duration_sec = ? WHERE id = ?').run(
    voiceUrl,
    Math.max(1, Math.min(30, Number(durationSec) || 8)),
    req.user.id
  );

  const trustScore = computeTrustScore(db, req.user.id);
  const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);

  return res.json({
    success: true,
    data: {
      voiceNoteUrl: voiceUrl,
      voiceDurationSec: updated.voice_duration_sec,
      trustScore,
      user: formatSelfUser(updated),
    },
  });
});

router.post('/me/avatar', requireAuth, (req, res) => {
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
  const uploadDir = path.join(config.rootDir, 'public/uploads/avatars');
  fs.mkdirSync(uploadDir, { recursive: true });
  fs.writeFileSync(path.join(uploadDir, filename), decoded);

  const avatarUrl = `/uploads/avatars/${filename}`;
  const db = getDb();
  db.prepare('UPDATE users SET avatar_url = ? WHERE id = ?').run(avatarUrl, req.user.id);
  const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);

  return res.json({
    success: true,
    data: {
      avatarUrl,
      user: formatSelfUser(updated),
    },
  });
});

router.post('/me/passport', requireAuth, (req, res) => {
  const { active = true, targetCity = 'Abidjan', arrivalDate = '', departureDate = '' } = req.body || {};
  const db = getDb();
  const user = req.user;
  const tier = getEffectiveSubscriptionTier(user);

  if (active && tier !== 'diaspora_vip' && !user.passport_active) {
    const debit = spendCauris(db, user.id, 200, `Activation Passeport Babi (${targetCity})`, 'PASSPORT-BABI');
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

  db.prepare(
    `UPDATE users SET passport_active = ?, passport_target_city = ?, passport_arrival_date = ?, passport_departure_date = ?
     WHERE id = ?`
  ).run(active ? 1 : 0, String(targetCity).slice(0, 80), String(arrivalDate).slice(0, 32), String(departureDate).slice(0, 32), user.id);

  const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id);
  return res.json({
    success: true,
    data: { user: formatSelfUser(updated) },
  });
});

router.post('/me/incognito', requireAuth, (req, res) => {
  const db = getDb();
  const user = req.user;
  const tier = getEffectiveSubscriptionTier(user);
  const nextVal = user.incognito ? 0 : 1;

  if (nextVal === 1 && !['babi_gold', 'diaspora_vip'].includes(tier)) {
    const debit = spendCauris(db, user.id, 200, 'Activation Mode Incognito 7 jours', 'INCOGNITO-7D');
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

  db.prepare('UPDATE users SET incognito = ? WHERE id = ?').run(nextVal, user.id);
  const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id);
  return res.json({
    success: true,
    data: { incognito: Boolean(nextVal), user: formatSelfUser(updated) },
  });
});

router.post('/me/boost', requireAuth, (req, res) => {
  const db = getDb();
  const user = req.user;
  const debit = spendCauris(db, user.id, 150, 'Boost Visibilité Tête d’affiche 24h', 'BOOST-24H');
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
  db.prepare('UPDATE users SET boost_expires_at = ? WHERE id = ?').run(expiresAt, user.id);
  const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id);
  return res.json({
    success: true,
    data: { boostExpiresAt: expiresAt, user: formatSelfUser(updated) },
  });
});

export default router;
