import express from 'express';
import crypto from 'node:crypto';
import { getDb, normalizeRows } from '../db/database.js';
import { requireAuth } from '../middleware/auth.js';
import { computeCompatibility, sanitizePublicProfile } from '../services/matchingService.js';
import { getBlockedUserIds, inspectMessageForScamSignals } from '../services/antiScamService.js';
import { getEffectiveSubscriptionTier, spendCauris } from '../services/monetizationService.js';
import { emitToUser } from '../ws/realtime.js';

const router = express.Router();

export function createMatchPair(db, userOneId, userTwoId, compatibilityScore, isSuperMatch = 0) {
  const [userA, userB] = [userOneId, userTwoId].sort();
  const existing = db.prepare('SELECT * FROM matches WHERE user_a = ? AND user_b = ?').get(userA, userB);
  if (existing) return { ...existing, created: false };

  const matchId = `match_${crypto.randomUUID().slice(0, 12)}`;
  db.prepare(
    `INSERT INTO matches (id, user_a, user_b, compatibility_score, is_super_match)
     VALUES (?, ?, ?, ?, ?)`
  ).run(matchId, userA, userB, compatibilityScore, isSuperMatch ? 1 : 0);

  return { id: matchId, user_a: userA, user_b: userB, compatibility_score: compatibilityScore, is_super_match: isSuperMatch ? 1 : 0, created: true };
}

router.post('/swipes', requireAuth, (req, res) => {
  const { targetId, action, reactionNote } = req.body || {};
  if (!targetId || !['pass', 'like', 'super_like'].includes(action)) {
    return res.status(422).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'targetId et action valide (pass, like, super_like) requis.' },
    });
  }
  const cleanReaction = typeof reactionNote === 'string' ? reactionNote.trim().slice(0, 280) : '';

  const db = getDb();
  const actor = req.user;
  if (targetId === actor.id) {
    return res.status(422).json({
      success: false,
      error: { code: 'SELF_SWIPE_FORBIDDEN', message: 'Impossible de swiper votre propre profil.' },
    });
  }

  const blocked = getBlockedUserIds(db, actor.id);
  if (blocked.has(targetId)) {
    return res.status(403).json({
      success: false,
      error: { code: 'USER_BLOCKED', message: 'Interaction indisponible avec ce profil.' },
    });
  }

  const target = db.prepare('SELECT * FROM users WHERE id = ?').get(targetId);
  if (!target) {
    return res.status(404).json({ success: false, error: { code: 'TARGET_NOT_FOUND', message: 'Profil cible introuvable.' } });
  }

  const actorTier = getEffectiveSubscriptionTier(actor);
  if (action === 'super_like' && !['babi_gold', 'diaspora_vip', 'djo_3d'].includes(actorTier)) {
    const debit = spendCauris(db, actor.id, 60, `Super Coup de Cœur pour ${target.name}`, `SUPER-${target.id}`);
    if (!debit.ok) {
      return res.status(402).json({
        success: false,
        error: { code: 'INSUFFICIENT_CAURIS', message: '60 Cauris requis pour un Super Coup de Cœur (ou Pass actif).' },
      });
    }
  }

  db.prepare(
    `INSERT INTO swipes (actor_id, target_id, action) VALUES (?, ?, ?)
     ON CONFLICT(actor_id, target_id) DO UPDATE SET action = excluded.action, created_at = CURRENT_TIMESTAMP`
  ).run(actor.id, target.id, action);

  let isMatch = false;
  let matchObj = null;

  if (action === 'like' || action === 'super_like') {
    const reciprocal = db
      .prepare("SELECT * FROM swipes WHERE actor_id = ? AND target_id = ? AND action IN ('like', 'super_like')")
      .get(target.id, actor.id);

    // Demo bots with high affinity or Verified 225 reciprocate realistically when super-liked or >= 76% compatibility
    const compat = computeCompatibility(actor, target);
    const shouldAutoMatch = Boolean(reciprocal) || (target.is_demo_bot && (action === 'super_like' || compat.score >= 76));

    if (shouldAutoMatch) {
      if (!reciprocal && target.is_demo_bot) {
        db.prepare(
          `INSERT OR IGNORE INTO swipes (actor_id, target_id, action) VALUES (?, ?, 'like')`
        ).run(target.id, actor.id);
      }
      isMatch = true;
      matchObj = createMatchPair(db, actor.id, target.id, compat.score, action === 'super_like' || reciprocal?.action === 'super_like');

      if (cleanReaction) {
        const scamCheck = inspectMessageForScamSignals(cleanReaction);
        const reactionMsgId = `msg_${crypto.randomUUID().slice(0, 12)}`;
        db.prepare(
          `INSERT INTO messages (id, match_id, sender_id, recipient_id, msg_type, content, scam_flagged, scam_reason)
           VALUES (?, ?, ?, ?, 'text', ?, ?, ?)`
        ).run(
          reactionMsgId,
          matchObj.id,
          actor.id,
          target.id,
          cleanReaction,
          scamCheck.flagged ? 1 : 0,
          scamCheck.reason
        );
        const savedReaction = { ...db.prepare('SELECT * FROM messages WHERE id = ?').get(reactionMsgId) };
        emitToUser(target.id, { type: 'message', matchId: matchObj.id, message: savedReaction });
      }

      if (matchObj.created && target.is_demo_bot) {
        const msgId = `msg_${crypto.randomUUID().slice(0, 12)}`;
        const greeting = cleanReaction
          ? `Akwaba ${actor.name} ! J’adore ta réaction sur mon profil (${compat.score}% d’alchimie). On continue d’en parler ici ?`
          : `Akwaba ${actor.name} ! Ravi(e) de matcher avec toi (${compat.score}% d'alchimie). ${compat.reasons[0] || ''}`;
        db.prepare(
          `INSERT INTO messages (id, match_id, sender_id, recipient_id, msg_type, content)
           VALUES (?, ?, ?, ?, 'text', ?)`
        ).run(msgId, matchObj.id, target.id, actor.id, greeting);
      }

      emitToUser(target.id, {
        type: 'match',
        matchId: matchObj.id,
        partner: sanitizePublicProfile(actor, target),
      });
      emitToUser(actor.id, {
        type: 'match',
        matchId: matchObj.id,
        partner: sanitizePublicProfile(target, actor),
      });
    }
  }

  const updatedActor = db.prepare('SELECT cauris_balance FROM users WHERE id = ?').get(actor.id);
  return res.json({
    success: true,
    data: {
      action,
      isMatch,
      match: matchObj ? { ...matchObj, partner: sanitizePublicProfile(target, actor) } : null,
      caurisBalance: Number(updatedActor.cauris_balance),
    },
  });
});

router.post('/swipes/rewind', requireAuth, (req, res) => {
  const db = getDb();
  const actor = req.user;
  const lastPass = db
    .prepare("SELECT * FROM swipes WHERE actor_id = ? AND action = 'pass' ORDER BY id DESC LIMIT 1")
    .get(actor.id);

  if (!lastPass) {
    return res.status(404).json({
      success: false,
      error: { code: 'NOTHING_TO_REWIND', message: 'Aucun profil passé récemment.' },
    });
  }

  if (getEffectiveSubscriptionTier(actor) === 'free') {
    const debit = spendCauris(db, actor.id, 60, 'Retour arrière sur un profil passé', 'REWIND');
    if (!debit.ok) {
      return res.status(402).json({
        success: false,
        error: { code: 'INSUFFICIENT_CAURIS', message: '60 Cauris requis pour revenir en arrière (ou Pass actif).' },
      });
    }
  }

  db.prepare('DELETE FROM swipes WHERE id = ?').run(lastPass.id);
  const target = db.prepare('SELECT * FROM users WHERE id = ?').get(lastPass.target_id);
  const updated = db.prepare('SELECT cauris_balance FROM users WHERE id = ?').get(actor.id);

  return res.json({
    success: true,
    data: {
      restoredProfile: target ? sanitizePublicProfile(target, actor) : null,
      caurisBalance: Number(updated.cauris_balance),
    },
  });
});

router.get('/matches', requireAuth, (req, res) => {
  const db = getDb();
  const viewer = req.user;
  const blocked = getBlockedUserIds(db, viewer.id);
  const rows = normalizeRows(
    db.prepare('SELECT * FROM matches WHERE user_a = ? OR user_b = ? ORDER BY created_at DESC').all(viewer.id, viewer.id)
  );

  const list = [];
  for (const m of rows) {
    const partnerId = m.user_a === viewer.id ? m.user_b : m.user_a;
    if (blocked.has(partnerId)) continue;
    const partner = db.prepare('SELECT * FROM users WHERE id = ?').get(partnerId);
    if (!partner) continue;

    const lastMsg = db
      .prepare('SELECT * FROM messages WHERE match_id = ? ORDER BY created_at DESC LIMIT 1')
      .get(m.id);
    const unreadRow = db
      .prepare('SELECT COUNT(*) as cnt FROM messages WHERE match_id = ? AND recipient_id = ? AND is_read = 0')
      .get(m.id, viewer.id);

    list.push({
      id: m.id,
      compatibilityScore: m.compatibility_score,
      isSuperMatch: Boolean(m.is_super_match),
      createdAt: m.created_at,
      unreadCount: unreadRow ? Number(unreadRow.cnt) : 0,
      lastMessage: lastMsg ? { ...lastMsg } : null,
      partner: sanitizePublicProfile(partner, viewer),
    });
  }

  return res.json({ success: true, data: { matches: list } });
});

router.get('/likes/received', requireAuth, (req, res) => {
  const db = getDb();
  const viewer = req.user;
  const blocked = getBlockedUserIds(db, viewer.id);
  const isVip = ['babi_gold', 'diaspora_vip'].includes(getEffectiveSubscriptionTier(viewer));

  const incoming = normalizeRows(
    db
      .prepare(
        `SELECT s.*, u.id AS u_id
         FROM swipes s
         JOIN users u ON u.id = s.actor_id
         WHERE s.target_id = ? AND s.action IN ('like', 'super_like')
         ORDER BY s.created_at DESC`
      )
      .all(viewer.id)
  );

  const admirers = [];
  for (const row of incoming) {
    if (blocked.has(row.actor_id)) continue;
    // Skip if already matched
    const [a, b] = [viewer.id, row.actor_id].sort();
    const matched = db.prepare('SELECT id FROM matches WHERE user_a = ? AND user_b = ?').get(a, b);
    if (matched) continue;

    const actor = db.prepare('SELECT * FROM users WHERE id = ?').get(row.actor_id);
    if (!actor) continue;

    const unlocked = isVip || Boolean(row.revealed);
    const profile = sanitizePublicProfile(actor, viewer);

    admirers.push({
      swipeId: row.id,
      action: row.action,
      unlocked,
      createdAt: row.created_at,
      profile: unlocked
        ? profile
        : {
            id: profile.id,
            name: `${profile.name[0]}•••`,
            age: profile.age,
            commune: profile.commune,
            intention: profile.intention,
            verified225: profile.verified225,
            compatibility: profile.compatibility,
            avatarUrl: profile.avatarUrl,
            blurred: true,
          },
    });
  }

  return res.json({
    success: true,
    data: {
      admirers,
      isVip,
      revealCostCauris: 120,
    },
  });
});

router.post('/likes/:userId/reveal', requireAuth, (req, res) => {
  const db = getDb();
  const viewer = req.user;
  const targetId = req.params.userId;

  if (getBlockedUserIds(db, viewer.id).has(targetId)) {
    return res.status(404).json({ success: false, error: { code: 'LIKE_NOT_FOUND', message: 'Admirateur introuvable.' } });
  }

  const swipe = db
    .prepare("SELECT * FROM swipes WHERE actor_id = ? AND target_id = ? AND action IN ('like', 'super_like')")
    .get(targetId, viewer.id);

  if (!swipe) {
    return res.status(404).json({ success: false, error: { code: 'LIKE_NOT_FOUND', message: 'Admirateur introuvable.' } });
  }

  if (!swipe.revealed && !['babi_gold', 'diaspora_vip'].includes(getEffectiveSubscriptionTier(viewer))) {
    const debit = spendCauris(db, viewer.id, 120, 'Révélation d’un admirateur', `REVEAL-${targetId}`);
    if (!debit.ok) {
      return res.status(402).json({
        success: false,
        error: { code: 'INSUFFICIENT_CAURIS', message: '120 Cauris requis pour révéler cet admirateur (ou Pass Babi Gold).' },
      });
    }
    db.prepare('UPDATE swipes SET revealed = 1 WHERE id = ?').run(swipe.id);
  }

  const actor = db.prepare('SELECT * FROM users WHERE id = ?').get(targetId);
  const updatedViewer = db.prepare('SELECT cauris_balance FROM users WHERE id = ?').get(viewer.id);

  return res.json({
    success: true,
    data: {
      profile: sanitizePublicProfile(actor, viewer),
      caurisBalance: Number(updatedViewer.cauris_balance),
    },
  });
});

export default router;
