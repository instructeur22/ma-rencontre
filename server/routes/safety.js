import express from 'express';
import { getDb } from '../db/database.js';
import { requireAuth } from '../middleware/auth.js';
import {
  computeTrustScore,
  getDailyChallenge,
  submitSelfieVerification,
} from '../services/antiScamService.js';
import { formatSelfUser } from './auth.js';

const router = express.Router();

router.get('/challenge', requireAuth, (req, res) => {
  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  return res.json({
    success: true,
    data: {
      challenge: getDailyChallenge(),
      verified225: Boolean(user.verified_225),
      trustScore: user.trust_score,
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

router.post('/verify-selfie', requireAuth, (req, res) => {
  const { challengeCode, selfieSnapshot } = req.body || {};
  const db = getDb();
  const result = submitSelfieVerification(db, req.user.id, challengeCode, selfieSnapshot);
  const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);

  return res.json({
    success: true,
    data: {
      ...result,
      user: formatSelfUser(updated),
    },
  });
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
