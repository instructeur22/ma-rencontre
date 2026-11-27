import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';
import { normalizeRows } from '../db/database.js';
import { SELFIE_CHALLENGES, computeTrustScore } from './antiScamService.js';
import { parseJsonSafe } from './matchingService.js';
import { emitToUser } from '../ws/realtime.js';

const MAX_SELFIE_BYTES = 3 * 1024 * 1024;
const MIN_SELFIE_BYTES = 32;

const MIME_BY_EXT = {
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

export function getPrivateVerificationsDir() {
  return path.join(config.dataDir, 'private_verifications');
}

export function validateSelfieImageBase64(rawInput) {
  if (!rawInput || typeof rawInput !== 'string') {
    return { ok: false, status: 422, code: 'INVALID_SELFIE_IMAGE', message: 'Image selfie réelle requise (JPEG, PNG ou WebP).' };
  }

  let declaredMime = '';
  let rawBase64 = rawInput.trim();
  const dataUriMatch = rawBase64.match(/^data:([^;]+);base64,(.+)$/i);
  if (dataUriMatch) {
    declaredMime = dataUriMatch[1].trim().toLowerCase();
    rawBase64 = dataUriMatch[2].trim();
  } else if (rawBase64.startsWith('data:')) {
    return { ok: false, status: 422, code: 'INVALID_SELFIE_IMAGE', message: 'Format data-URI image selfie invalide.' };
  }

  if (declaredMime && !/^image\/(jpeg|jpg|png|webp)$/i.test(declaredMime)) {
    return { ok: false, status: 422, code: 'INVALID_SELFIE_IMAGE', message: 'Seuls les formats JPEG, PNG et WebP sont acceptés.' };
  }

  // Reject arbitrary short placeholder strings before decoding
  if (!/^[A-Za-z0-9+/=\s]+$/.test(rawBase64) || rawBase64.length < 40) {
    return { ok: false, status: 422, code: 'INVALID_SELFIE_IMAGE', message: 'Capture image selfie invalide : activez la caméra ou importez une vraie photo.' };
  }

  const buffer = Buffer.from(rawBase64, 'base64');
  if (buffer.byteLength > MAX_SELFIE_BYTES) {
    return { ok: false, status: 413, code: 'SELFIE_TOO_LARGE', message: 'Image selfie trop volumineuse (max 3 Mo).' };
  }
  if (buffer.byteLength < MIN_SELFIE_BYTES) {
    return { ok: false, status: 422, code: 'INVALID_SELFIE_IMAGE', message: 'Fichier image selfie trop petit ou corrompu.' };
  }

  let ext = null;
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
    ext = 'png';
  } else if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    ext = 'jpg';
  } else if (buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') {
    ext = 'webp';
  }

  if (!ext) {
    return {
      ok: false,
      status: 422,
      code: 'INVALID_SELFIE_IMAGE',
      message: 'En-tête binaire image non reconnu (JPEG, PNG ou WebP uniquement).',
    };
  }

  return { ok: true, buffer, ext, mimeType: MIME_BY_EXT[ext] };
}

function readLocalProfilePhoto(avatarUrl) {
  if (!avatarUrl || typeof avatarUrl !== 'string') return null;
  const trimmed = avatarUrl.trim();
  if (trimmed.includes('..')) return null;

  let fullPath = null;
  if (trimmed.startsWith('/uploads/')) {
    const rel = trimmed.replace(/^\/uploads\//, '');
    const inUploadsDir = path.join(config.uploadsDir, rel);
    const inPublicUploads = path.join(config.rootDir, 'public', trimmed.replace(/^\/+/, ''));
    fullPath = fs.existsSync(inUploadsDir) ? inUploadsDir : inPublicUploads;
  } else if (trimmed.startsWith('/assets/')) {
    fullPath = path.join(config.rootDir, 'public', trimmed.replace(/^\/+/, ''));
  } else {
    return null;
  }

  if (!fullPath || !fs.existsSync(fullPath)) return null;
  try {
    const buf = fs.readFileSync(fullPath);
    if (buf.byteLength > MAX_SELFIE_BYTES || buf.byteLength < MIN_SELFIE_BYTES) return null;
    const lower = fullPath.toLowerCase();
    const mimeType = lower.endsWith('.png') ? 'image/png' : lower.endsWith('.webp') ? 'image/webp' : 'image/jpeg';
    return { buffer: buf, mimeType };
  } catch {
    return null;
  }
}

export async function analyzeSelfieWithGemini({ selfieBuffer, selfieMime, profilePhoto, challenge }) {
  if (!config.selfieAi.geminiApiKey) {
    return {
      provider: 'manual_queue',
      outcome: 'pending_review',
      confidence: 0,
      reason: 'Cliché enregistré et transmis à la modération Bouclier Babi pour validation.',
      details: { mode: 'manual_fallback' },
    };
  }

  const prompt = [
    'Tu es le moteur de vérification anti-catfish « Bouclier Babi » pour une application de rencontres.',
    `Défi gestuel demandé à l’utilisateur : "${challenge.label}" (${challenge.code}).`,
    profilePhoto
      ? 'La première image est le selfie soumis à l’instant ; la deuxième image est la photo de profil actuelle du compte.'
      : 'L’image fournie est le selfie soumis à l’instant.',
    'Évalue strictement :',
    '1. face_detected (boolean) : un vrai visage humain vivant est-il clairement visible (pas un écran de téléphone, dessin ou photo vide) ?',
    '2. gesture_matches (boolean) : la personne réalise-t-elle le geste exact du défi demandé ?',
    '3. matches_profile_photo (boolean) : si la photo de profil est fournie, semble-t-il s’agir de la même personne (sinon true) ?',
    '4. confidence (number entre 0 et 1) : ton niveau de certitude global.',
    '5. reason (string en français, 1 phrase courte et courtoise expliquant le verdict).',
    'Réponds UNIQUEMENT par un objet JSON valide avec ces 5 clés.',
  ].join('\n');

  const parts = [
    { text: prompt },
    { inlineData: { mimeType: selfieMime, data: selfieBuffer.toString('base64') } },
  ];
  if (profilePhoto) {
    parts.push({ inlineData: { mimeType: profilePhoto.mimeType, data: profilePhoto.buffer.toString('base64') } });
  }

  const endpoint = `${config.selfieAi.baseUrl}/models/${encodeURIComponent(config.selfieAi.geminiModel)}:generateContent`;

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': config.selfieAi.geminiApiKey,
      },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: {
          temperature: 0.1,
          responseMimeType: 'application/json',
        },
      }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      return {
        provider: `gemini:${config.selfieAi.geminiModel}`,
        outcome: 'pending_review',
        confidence: 0,
        reason: `Analyse IA temporairement indisponible (HTTP ${res.status}) — transmis à la modération manuelle.`,
        details: { httpStatus: res.status },
      };
    }

    const json = await res.json().catch(() => ({}));
    const rawText = json?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const cleaned = rawText.replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
    const parsed = parseJsonSafe(cleaned, null);

    if (!parsed || typeof parsed !== 'object') {
      return {
        provider: `gemini:${config.selfieAi.geminiModel}`,
        outcome: 'pending_review',
        confidence: 0,
        reason: 'Résultat d’analyse incertain — transmis à la modération manuelle.',
        details: { rawText: rawText.slice(0, 200) },
      };
    }

    const faceDetected = Boolean(parsed.face_detected);
    const gestureMatches = Boolean(parsed.gesture_matches);
    const matchesProfile = parsed.matches_profile_photo === undefined ? true : Boolean(parsed.matches_profile_photo);
    const confidence = Math.max(0, Math.min(1, Number(parsed.confidence) || 0));
    const reason = String(parsed.reason || '').trim().slice(0, 280) || 'Analyse effectuée par Bouclier Babi.';

    let outcome = 'pending_review';
    if (faceDetected && gestureMatches && matchesProfile && confidence >= 0.8) {
      outcome = 'verified';
    } else if (!faceDetected || !gestureMatches || confidence < 0.45) {
      outcome = 'rejected';
    }

    return {
      provider: `gemini:${config.selfieAi.geminiModel}`,
      outcome,
      confidence,
      reason,
      details: { faceDetected, gestureMatches, matchesProfile, confidence },
    };
  } catch (err) {
    return {
      provider: `gemini:${config.selfieAi.geminiModel}`,
      outcome: 'pending_review',
      confidence: 0,
      reason: 'Analyse IA indisponible — cliché mis en file de modération manuelle.',
      details: { error: err.message },
    };
  }
}

export async function processSelfieSubmission(db, userRow, { challengeCode, imageBase64 }) {
  const validated = validateSelfieImageBase64(imageBase64);
  if (!validated.ok) {
    return validated;
  }

  const challenge = SELFIE_CHALLENGES.find((c) => c.code === challengeCode) || SELFIE_CHALLENGES[0];
  const verId = `ver_${crypto.randomUUID().slice(0, 12)}`;
  const privateDir = getPrivateVerificationsDir();
  fs.mkdirSync(privateDir, { recursive: true, mode: 0o700 });

  const filename = `${verId}.${validated.ext}`;
  const fullPath = path.join(privateDir, filename);
  fs.writeFileSync(fullPath, validated.buffer, { mode: 0o600 });

  const profilePhoto = readLocalProfilePhoto(userRow.avatar_url);
  const ai = await analyzeSelfieWithGemini({
    selfieBuffer: validated.buffer,
    selfieMime: validated.mimeType,
    profilePhoto,
    challenge,
  });

  const reviewedAt = ai.outcome === 'verified' || ai.outcome === 'rejected' ? new Date().toISOString() : null;
  db.prepare(
    `INSERT INTO safety_verifications (
      id, user_id, challenge_code, challenge_label, status, selfie_snapshot,
      image_path, ai_provider, ai_confidence, ai_reason, ai_details_json, reviewed_at
    ) VALUES (?, ?, ?, ?, ?, '', ?, ?, ?, ?, ?, ?)`
  ).run(
    verId,
    userRow.id,
    challenge.code,
    challenge.label,
    ai.outcome,
    filename,
    ai.provider,
    ai.confidence,
    ai.reason,
    JSON.stringify(ai.details || {}),
    reviewedAt
  );

  if (ai.outcome === 'verified') {
    db.prepare('UPDATE users SET verified_225 = 1 WHERE id = ?').run(userRow.id);
  }

  const newScore = computeTrustScore(db, userRow.id);
  const refreshedUser = db.prepare('SELECT * FROM users WHERE id = ?').get(userRow.id);

  return {
    ok: true,
    status: 200,
    data: {
      verificationId: verId,
      status: ai.outcome,
      verified225: Boolean(refreshedUser.verified_225),
      trustScore: newScore,
      aiProvider: ai.provider,
      aiConfidence: ai.confidence,
      aiReason: ai.reason,
      challenge,
    },
  };
}

export function getLatestUserVerification(db, userId) {
  const row = db
    .prepare(
      `SELECT id, challenge_code, challenge_label, status, ai_provider, ai_confidence, ai_reason, reviewer_note, reviewed_at, created_at
       FROM safety_verifications
       WHERE user_id = ?
       ORDER BY rowid DESC LIMIT 1`
    )
    .get(userId);
  if (!row) return null;
  return {
    id: row.id,
    challengeCode: row.challenge_code,
    challengeLabel: row.challenge_label,
    status: row.status,
    aiProvider: row.ai_provider || '',
    aiConfidence: Number(row.ai_confidence || 0),
    aiReason: row.ai_reason || '',
    reviewerNote: row.reviewer_note || '',
    reviewedAt: row.reviewed_at || '',
    createdAt: row.created_at || '',
  };
}

export function listVerificationQueue(db, statusFilter = 'pending_review') {
  const allowed = ['pending_review', 'verified', 'rejected', 'all'];
  const safeStatus = allowed.includes(statusFilter) ? statusFilter : 'pending_review';
  const query =
    safeStatus === 'all'
      ? `SELECT v.*, u.name AS user_name, u.age AS user_age, u.commune AS user_commune, u.avatar_url AS user_avatar_url
         FROM safety_verifications v
         JOIN users u ON u.id = v.user_id
         ORDER BY v.rowid DESC LIMIT 50`
      : `SELECT v.*, u.name AS user_name, u.age AS user_age, u.commune AS user_commune, u.avatar_url AS user_avatar_url
         FROM safety_verifications v
         JOIN users u ON u.id = v.user_id
         WHERE v.status = ?
         ORDER BY v.rowid DESC LIMIT 50`;

  const rows = normalizeRows(safeStatus === 'all' ? db.prepare(query).all() : db.prepare(query).all(safeStatus));
  return rows.map((r) => ({
    id: r.id,
    userId: r.user_id,
    userName: r.user_name,
    userAge: r.user_age,
    userCommune: r.user_commune,
    userAvatarUrl: r.user_avatar_url,
    challengeCode: r.challenge_code,
    challengeLabel: r.challenge_label,
    status: r.status,
    hasImage: Boolean(r.image_path),
    aiProvider: r.ai_provider || '',
    aiConfidence: Number(r.ai_confidence || 0),
    aiReason: r.ai_reason || '',
    reviewerNote: r.reviewer_note || '',
    reviewedAt: r.reviewed_at || '',
    createdAt: r.created_at || '',
  }));
}

export function resolvePrivateSelfieFile(db, verificationId) {
  const row = db.prepare('SELECT id, image_path FROM safety_verifications WHERE id = ?').get(verificationId);
  if (!row || !row.image_path) return null;
  const filename = path.basename(row.image_path);
  const baseDir = path.resolve(getPrivateVerificationsDir());
  const fullPath = path.resolve(baseDir, filename);
  if (!fullPath.startsWith(baseDir + path.sep) || !fs.existsSync(fullPath)) return null;
  const ext = path.extname(filename).replace('.', '').toLowerCase();
  return { fullPath, mimeType: MIME_BY_EXT[ext] || 'image/jpeg' };
}

export function reviewVerification(db, verificationId, { decision, note = '' }) {
  if (!['verified', 'rejected'].includes(decision)) {
    return {
      ok: false,
      status: 422,
      code: 'INVALID_DECISION',
      message: 'decision doit être verified ou rejected.',
    };
  }

  const row = db.prepare('SELECT * FROM safety_verifications WHERE id = ?').get(verificationId);
  if (!row) {
    return { ok: false, status: 404, code: 'VERIFICATION_NOT_FOUND', message: 'Demande introuvable.' };
  }

  const cleanNote = String(note || '').trim().slice(0, 280);
  const nowIso = new Date().toISOString();
  db.prepare(
    `UPDATE safety_verifications SET status = ?, reviewer_note = ?, reviewed_at = ? WHERE id = ?`
  ).run(decision, cleanNote, nowIso, verificationId);

  if (decision === 'verified') {
    db.prepare('UPDATE users SET verified_225 = 1 WHERE id = ?').run(row.user_id);
  } else {
    const anyVerified = db
      .prepare("SELECT 1 FROM safety_verifications WHERE user_id = ? AND status = 'verified' LIMIT 1")
      .get(row.user_id);
    if (!anyVerified) {
      db.prepare('UPDATE users SET verified_225 = 0 WHERE id = ?').run(row.user_id);
    }
  }

  const trustScore = computeTrustScore(db, row.user_id);
  const updatedUser = db.prepare('SELECT verified_225 FROM users WHERE id = ?').get(row.user_id);
  const verified225 = Boolean(updatedUser?.verified_225);

  emitToUser(row.user_id, {
    type: 'verification_updated',
    verificationId,
    status: decision,
    verified225,
    trustScore,
    note: cleanNote,
  });

  return {
    ok: true,
    status: 200,
    data: {
      verificationId,
      userId: row.user_id,
      status: decision,
      verified225,
      trustScore,
      reviewerNote: cleanNote,
    },
  };
}
