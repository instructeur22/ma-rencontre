import crypto from 'node:crypto';
import express from 'express';
import { config } from '../config.js';
import { getDb, normalizeRows } from '../db/database.js';
import { requireAuth } from '../middleware/auth.js';
import { createRateLimiter } from '../middleware/rateLimit.js';
import { computeTrustScore, getDailyChallenge } from '../services/antiScamService.js';
import {
  getLatestUserVerification,
  listVerificationQueue,
  processSelfieSubmission,
  resolvePrivateSelfieFile,
  reviewVerification,
} from '../services/selfieVerificationService.js';
import { formatSelfUser, purgeUserAccount } from './auth.js';

const router = express.Router();

const adminBruteForceLimiter = createRateLimiter({
  windowMs: 15 * 60_000,
  max: 5,
  onlyFailed: true,
  code: 'ADMIN_RATE_LIMITED',
  message: 'Trop de tentatives admin erronées. Accès temporairement bloqué (15 min).',
});

router.use('/admin', adminBruteForceLimiter);

function requireModerationAdmin(req, res, next) {
  const configured = config.adminModerationSecret;
  if (!configured) {
    return res.status(503).json({
      success: false,
      error: { code: 'ADMIN_MODERATION_DISABLED', message: 'Secret de modération admin non configuré.' },
    });
  }
  const provided = String(req.header('X-Admin-Secret') || '');
  const bufA = Buffer.from(provided, 'utf8');
  const bufB = Buffer.from(configured, 'utf8');
  if (bufA.length !== bufB.length || !crypto.timingSafeEqual(bufA, bufB)) {
    return res.status(401).json({
      success: false,
      error: { code: 'ADMIN_UNAUTHORIZED', message: 'Accès modération Bouclier Babi refusé.' },
    });
  }
  return next();
}

router.get('/challenge', requireAuth, (req, res) => {
  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  const latestVerification = getLatestUserVerification(db, req.user.id);
  return res.json({
    success: true,
    data: {
      challenge: getDailyChallenge(),
      verified225: Boolean(user.verified_225),
      trustScore: user.trust_score,
      aiVisionEnabled: Boolean(config.selfieAi.geminiApiKey),
      whatsappSimulator: Boolean(config.whatsapp.useLocalSimulator),
      latestVerification,
      breakdown: {
        base: 40,
        phoneVerified: user.phone_verified ? 15 : 0,
        selfieVerified225: user.verified_225 ? 25 : 0,
        voiceBio: user.voice_note_url ? 10 : 0,
        completeProfile: user.bio && user.bio.length >= 40 ? 10 : 0,
      },
    },
  });
});

router.post('/verify-selfie', requireAuth, async (req, res) => {
  const { challengeCode, imageBase64, selfieSnapshot } = req.body || {};
  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);

  const result = await processSelfieSubmission(db, user, {
    challengeCode,
    imageBase64: imageBase64 || selfieSnapshot,
  });

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

router.get('/admin/verifications', requireModerationAdmin, (req, res) => {
  const db = getDb();
  const status = String(req.query.status || 'pending_review');
  const verifications = listVerificationQueue(db, status);
  return res.json({
    success: true,
    data: { verifications },
  });
});

router.get('/admin/verifications/:id/image', requireModerationAdmin, (req, res) => {
  const db = getDb();
  const resolved = resolvePrivateSelfieFile(db, req.params.id);
  if (!resolved) {
    return res.status(404).json({
      success: false,
      error: { code: 'IMAGE_NOT_FOUND', message: 'Image de vérification introuvable.' },
    });
  }
  res.setHeader('Content-Type', resolved.mimeType);
  res.setHeader('Cache-Control', 'no-store');
  return res.sendFile(resolved.fullPath);
});

router.post('/admin/verifications/:id/review', requireModerationAdmin, (req, res) => {
  const { decision, note } = req.body || {};
  const db = getDb();
  const result = reviewVerification(db, req.params.id, { decision, note });
  if (!result.ok) {
    return res.status(result.status).json({
      success: false,
      error: { code: result.code, message: result.message },
    });
  }
  return res.json({
    success: true,
    data: result.data,
  });
});

router.get('/admin/reports', requireModerationAdmin, (_req, res) => {
  const db = getDb();
  const reports = normalizeRows(
    db
      .prepare(
        `SELECT br.id, br.action_type, br.reason, br.created_at,
                rep.id AS reporter_id, rep.name AS reporter_name,
                tgt.id AS target_id, tgt.name AS target_name, tgt.age AS target_age,
                tgt.commune AS target_commune, tgt.avatar_url AS target_avatar_url,
                tgt.trust_score AS target_trust_score, tgt.verified_225 AS target_verified_225,
                (SELECT COUNT(*) FROM blocks_reports br2 WHERE br2.target_id = tgt.id AND br2.action_type = 'report') AS total_reports
         FROM blocks_reports br
         JOIN users rep ON rep.id = br.reporter_id
         JOIN users tgt ON tgt.id = br.target_id
         WHERE br.action_type = 'report'
         ORDER BY br.id DESC LIMIT 50`
      )
      .all()
  ).map((r) => ({
    id: r.id,
    actionType: r.action_type,
    reason: r.reason,
    createdAt: r.created_at,
    reporterId: r.reporter_id,
    reporterName: r.reporter_name,
    targetId: r.target_id,
    targetName: r.target_name,
    targetAge: r.target_age,
    targetCommune: r.target_commune,
    targetAvatarUrl: r.target_avatar_url,
    targetTrustScore: r.target_trust_score,
    targetVerified225: Boolean(r.target_verified_225),
    totalReports: Number(r.total_reports || 1),
  }));

  return res.json({
    success: true,
    data: { reports },
  });
});

router.delete('/admin/users/:id', requireModerationAdmin, (req, res) => {
  const db = getDb();
  const result = purgeUserAccount(db, req.params.id);
  if (!result.deleted) {
    return res.status(404).json({
      success: false,
      error: { code: 'USER_NOT_FOUND', message: 'Compte introuvable ou déjà supprimé.' },
    });
  }
  return res.json({ success: true, data: result });
});

router.post('/report', requireAuth, (req, res) => {
  const { targetId, reason = 'Comportement suspect ou arnaque', alsoBlock = true } = req.body || {};
  if (!targetId) {
    return res.status(422).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'targetId requis.' } });
  }
  if (targetId === req.user.id) {
    return res.status(422).json({ success: false, error: { code: 'SELF_ACTION_FORBIDDEN', message: 'Impossible de vous signaler vous-même.' } });
  }

  const db = getDb();
  const target = db.prepare('SELECT id FROM users WHERE id = ?').get(targetId);
  if (!target) {
    return res.status(404).json({ success: false, error: { code: 'TARGET_NOT_FOUND', message: 'Profil cible introuvable.' } });
  }

  const cleanReason = String(reason).slice(0, 300);
  const existingReport = db
    .prepare("SELECT id FROM blocks_reports WHERE reporter_id = ? AND target_id = ? AND action_type = 'report'")
    .get(req.user.id, targetId);
  if (!existingReport) {
    db.prepare(
      `INSERT INTO blocks_reports (reporter_id, target_id, action_type, reason)
       VALUES (?, ?, 'report', ?)`
    ).run(req.user.id, targetId, cleanReason);
  }

  if (alsoBlock) {
    const existingBlock = db
      .prepare("SELECT id FROM blocks_reports WHERE reporter_id = ? AND target_id = ? AND action_type = 'block'")
      .get(req.user.id, targetId);
    if (!existingBlock) {
      db.prepare(
        `INSERT INTO blocks_reports (reporter_id, target_id, action_type, reason)
         VALUES (?, ?, 'block', ?)`
      ).run(req.user.id, targetId, cleanReason);
    }
  }

  const targetNewScore = computeTrustScore(db, targetId);
  return res.json({
    success: true,
    data: {
      reported: true,
      blocked: Boolean(alsoBlock),
      targetTrustScore: targetNewScore,
    },
  });
});

router.post('/block', requireAuth, (req, res) => {
  const { targetId, reason = 'Bloqué par l’utilisateur' } = req.body || {};
  if (!targetId) {
    return res.status(422).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'targetId requis.' } });
  }
  if (targetId === req.user.id) {
    return res.status(422).json({ success: false, error: { code: 'SELF_ACTION_FORBIDDEN', message: 'Impossible de vous bloquer vous-même.' } });
  }
  const db = getDb();
  const target = db.prepare('SELECT id FROM users WHERE id = ?').get(targetId);
  if (!target) {
    return res.status(404).json({ success: false, error: { code: 'TARGET_NOT_FOUND', message: 'Profil cible introuvable.' } });
  }

  const existingBlock = db
    .prepare("SELECT id FROM blocks_reports WHERE reporter_id = ? AND target_id = ? AND action_type = 'block'")
    .get(req.user.id, targetId);
  if (!existingBlock) {
    db.prepare(
      `INSERT INTO blocks_reports (reporter_id, target_id, action_type, reason)
       VALUES (?, ?, 'block', ?)`
    ).run(req.user.id, targetId, String(reason).slice(0, 300));
  }

  return res.json({ success: true, data: { blocked: true } });
});

export default router;
