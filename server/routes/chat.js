import express from 'express';
import crypto from 'node:crypto';
import { getDb } from '../db/database.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { getBlockedUserIds, inspectMessageForScamSignals } from '../services/antiScamService.js';
import { computeCompatibility, parseJsonSafe } from '../services/matchingService.js';
import { saveMediaFile } from '../services/mediaStorageService.js';
import { STORE_CATALOG, getEffectiveSubscriptionTier, spendCauris } from '../services/monetizationService.js';
import { createMatchPair } from './matching.js';
import { emitToUser } from '../ws/realtime.js';

const router = express.Router();
const MAX_VOICE_BYTES = 4 * 1024 * 1024;
const MAX_MESSAGE_LENGTH = 2000;

async function getMatchPartner(db, matchId, userId) {
  const match = await db.get('SELECT * FROM matches WHERE id = ?', matchId);
  if (!match) return null;
  if (match.user_a !== userId && match.user_b !== userId) return null;
  const partnerId = match.user_a === userId ? match.user_b : match.user_a;
  const blocked = await getBlockedUserIds(db, userId);
  if (blocked.has(partnerId)) return null;
  const partner = await db.get('SELECT * FROM users WHERE id = ?', partnerId);
  if (!partner) return null;
  return { match, partner };
}

function scheduleDemoReplyIfApplicable(db, matchId, sender, partner, userContent) {
  if (!partner || !partner.is_demo_bot) return;
  setTimeout(async () => {
    try {
      const lower = (userContent || '').toLowerCase();
      let replyText = `Merci pour ton message ${sender.name} ! Ça me fait vraiment plaisir. Tu es dans quel coin cette semaine ?`;
      if (lower.includes('attiéké') || lower.includes('garba') || lower.includes('alloco') || lower.includes('dîner')) {
        replyText = `Ahaha tu parles mon langage là ! Quand tu veux on va tester une bonne adresse à ${partner.commune}.`;
      } else if (lower.includes('café') || lower.includes('verre') || lower.includes('brunch') || lower.includes('safe date') || lower.includes('cocody') || lower.includes('assinie')) {
        replyText = `Excellente idée ! Un rendez-vous dans un lieu vérifié Safe Date, c'est classe et rassurant. Je suis partant(e) !`;
      } else if (lower.includes('cadeau') || lower.includes('rose') || lower.includes('bissap') || lower.includes('cacao')) {
        replyText = `Oh trop mignon cette attention !! Merci beaucoup, tu sais marquer des points dès le début !`;
      } else if (lower.includes('vocal') || lower.includes('voix')) {
        replyText = `J'adore entendre la vraie voix des gens, ça rend les échanges tellement plus sincères sur AKWABA.`;
      }

      const msgId = `msg_${crypto.randomUUID().slice(0, 12)}`;
      await db.run(
        `INSERT INTO messages (id, match_id, sender_id, recipient_id, msg_type, content)
         VALUES (?, ?, ?, ?, 'text', ?)`,
        msgId,
        matchId,
        partner.id,
        sender.id,
        replyText
      );

      const saved = await db.get('SELECT * FROM messages WHERE id = ?', msgId);
      if (saved) {
        emitToUser(sender.id, {
          type: 'message',
          matchId,
          message: { ...saved },
        });
      }
    } catch {
      // Ignore if test DB closed
    }
  }, 900);
}

router.get('/:matchId/messages', requireAuth, asyncHandler(async (req, res) => {
  const db = getDb();
  const ctx = await getMatchPartner(db, req.params.matchId, req.user.id);
  if (!ctx) {
    return res.status(404).json({ success: false, error: { code: 'MATCH_NOT_FOUND', message: 'Conversation introuvable.' } });
  }

  await db.run('UPDATE messages SET is_read = 1 WHERE match_id = ? AND recipient_id = ?', ctx.match.id, req.user.id);
  const messages = await db.all(
    'SELECT * FROM messages WHERE match_id = ? ORDER BY created_at ASC, id ASC',
    ctx.match.id
  );

  return res.json({
    success: true,
    data: {
      matchId: ctx.match.id,
      messages,
    },
  });
}));

router.post('/:matchId/messages', requireAuth, asyncHandler(async (req, res) => {
  const { content } = req.body || {};
  const cleanContent = String(content || '').trim();
  if (!cleanContent) {
    return res.status(422).json({ success: false, error: { code: 'EMPTY_MESSAGE', message: 'Le message ne peut pas être vide.' } });
  }
  if (cleanContent.length > MAX_MESSAGE_LENGTH) {
    return res.status(422).json({ success: false, error: { code: 'MESSAGE_TOO_LONG', message: 'Message limité à 2 000 caractères.' } });
  }

  const db = getDb();
  const ctx = await getMatchPartner(db, req.params.matchId, req.user.id);
  if (!ctx) {
    return res.status(404).json({ success: false, error: { code: 'MATCH_NOT_FOUND', message: 'Conversation introuvable.' } });
  }

  const scamCheck = inspectMessageForScamSignals(cleanContent);
  const msgId = `msg_${crypto.randomUUID().slice(0, 12)}`;

  await db.run(
    `INSERT INTO messages (id, match_id, sender_id, recipient_id, msg_type, content, scam_flagged, scam_reason)
     VALUES (?, ?, ?, ?, 'text', ?, ?, ?)`,
    msgId,
    ctx.match.id,
    req.user.id,
    ctx.partner.id,
    cleanContent,
    scamCheck.flagged ? 1 : 0,
    scamCheck.reason
  );

  const saved = await db.get('SELECT * FROM messages WHERE id = ?', msgId);

  emitToUser(ctx.partner.id, {
    type: 'message',
    matchId: ctx.match.id,
    message: saved,
  });

  if (!scamCheck.flagged || scamCheck.severity !== 'high') {
    scheduleDemoReplyIfApplicable(db, ctx.match.id, req.user, ctx.partner, cleanContent);
  }

  return res.status(201).json({
    success: true,
    data: {
      message: saved,
      scamCheck,
    },
  });
}));

router.post('/direct', requireAuth, asyncHandler(async (req, res) => {
  const { targetId, content } = req.body || {};
  const cleanContent = String(content || '').trim();
  if (!targetId || !cleanContent) {
    return res.status(422).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'targetId et message requis pour un DM direct.' },
    });
  }
  if (cleanContent.length > MAX_MESSAGE_LENGTH) {
    return res.status(422).json({
      success: false,
      error: { code: 'MESSAGE_TOO_LONG', message: 'Message limité à 2 000 caractères.' },
    });
  }

  const db = getDb();
  const sender = req.user;
  if (targetId === sender.id) {
    return res.status(422).json({
      success: false,
      error: { code: 'SELF_DM_FORBIDDEN', message: 'Impossible de vous envoyer un DM à vous-même.' },
    });
  }
  const blocked = await getBlockedUserIds(db, sender.id);
  if (blocked.has(targetId)) {
    return res.status(403).json({
      success: false,
      error: { code: 'USER_BLOCKED', message: 'Impossible d’envoyer un message à ce profil.' },
    });
  }

  const target = await db.get('SELECT * FROM users WHERE id = ?', targetId);
  if (!target) {
    return res.status(404).json({ success: false, error: { code: 'TARGET_NOT_FOUND', message: 'Destinataire introuvable.' } });
  }

  const scamCheck = inspectMessageForScamSignals(cleanContent);
  if (scamCheck.flagged && scamCheck.severity === 'high') {
    return res.status(400).json({
      success: false,
      error: { code: 'BOUCLIER_BABI_BLOCKED', message: `Bouclier Babi : ${scamCheck.reason}` },
    });
  }

  const cost = getEffectiveSubscriptionTier(sender) === 'diaspora_vip' ? 0 : 100;
  if (cost > 0) {
    const debit = await spendCauris(db, sender.id, cost, `DM Direct à ${target.name}`, `DM-${target.id}`);
    if (!debit.ok) {
      return res.status(402).json({
        success: false,
        error: { code: 'INSUFFICIENT_CAURIS', message: '100 Cauris requis pour écrire avant un match (réponse gratuite pour l’autre).' },
      });
    }
  }

  const compat = computeCompatibility(sender, target);
  const match = await createMatchPair(db, sender.id, target.id, compat.score, 1);

  const msgId = `msg_${crypto.randomUUID().slice(0, 12)}`;
  await db.run(
    `INSERT INTO messages (id, match_id, sender_id, recipient_id, msg_type, content, scam_flagged, scam_reason)
     VALUES (?, ?, ?, ?, 'text', ?, ?, ?)`,
    msgId,
    match.id,
    sender.id,
    target.id,
    cleanContent,
    scamCheck.flagged ? 1 : 0,
    scamCheck.reason
  );

  const saved = await db.get('SELECT * FROM messages WHERE id = ?', msgId);
  emitToUser(target.id, { type: 'message', matchId: match.id, message: saved });
  scheduleDemoReplyIfApplicable(db, match.id, sender, target, cleanContent);

  const updated = await db.get('SELECT cauris_balance FROM users WHERE id = ?', sender.id);
  return res.status(201).json({
    success: true,
    data: {
      matchId: match.id,
      message: saved,
      caurisBalance: Number(updated.cauris_balance),
    },
  });
}));

router.post('/:matchId/voice', requireAuth, asyncHandler(async (req, res) => {
  const { audioBase64, mimeType = 'audio/webm', durationSec = 6 } = req.body || {};
  if (!audioBase64 || typeof audioBase64 !== 'string') {
    return res.status(422).json({ success: false, error: { code: 'INVALID_AUDIO', message: 'Audio manquant.' } });
  }

  const db = getDb();
  const ctx = await getMatchPartner(db, req.params.matchId, req.user.id);
  if (!ctx) {
    return res.status(404).json({ success: false, error: { code: 'MATCH_NOT_FOUND', message: 'Conversation introuvable.' } });
  }

  const base64Data = audioBase64.includes(',') ? audioBase64.split(',')[1] : audioBase64;
  const decoded = Buffer.from(base64Data, 'base64');
  if (decoded.byteLength === 0 || decoded.byteLength > MAX_VOICE_BYTES) {
    return res.status(decoded.byteLength > MAX_VOICE_BYTES ? 413 : 422).json({
      success: false,
      error: { code: 'INVALID_AUDIO_SIZE', message: 'Note vocale vide ou supérieure à 4 Mo.' },
    });
  }

  const ext = mimeType.includes('wav') ? 'wav' : mimeType.includes('mp4') ? 'm4a' : 'webm';
  const filename = `chat_${ctx.match.id}_${Date.now()}_${crypto.randomInt(100, 999)}.${ext}`;
  const mediaUrl = `/uploads/voices/${filename}`;
  const cleanMime = ext === 'wav' ? 'audio/wav' : ext === 'm4a' ? 'audio/mp4' : 'audio/webm';

  await saveMediaFile(db, {
    mediaPath: mediaUrl,
    userId: req.user.id,
    mimeType: cleanMime,
    buffer: decoded,
    visibility: 'public',
  });

  const dur = Math.max(1, Math.min(60, Number(durationSec) || 6));
  const msgId = `msg_${crypto.randomUUID().slice(0, 12)}`;

  await db.run(
    `INSERT INTO messages (id, match_id, sender_id, recipient_id, msg_type, content, media_url, metadata_json)
     VALUES (?, ?, ?, ?, 'voice', ?, ?, ?)`,
    msgId,
    ctx.match.id,
    req.user.id,
    ctx.partner.id,
    `Note vocale (0:${String(dur).padStart(2, '0')})`,
    mediaUrl,
    JSON.stringify({ durationSec: dur })
  );

  const saved = await db.get('SELECT * FROM messages WHERE id = ?', msgId);
  emitToUser(ctx.partner.id, { type: 'message', matchId: ctx.match.id, message: saved });
  scheduleDemoReplyIfApplicable(db, ctx.match.id, req.user, ctx.partner, 'note vocale');

  return res.status(201).json({ success: true, data: { message: saved } });
}));

router.post('/:matchId/gift', requireAuth, asyncHandler(async (req, res) => {
  const { giftCode } = req.body || {};
  const gift = STORE_CATALOG.culturalGifts.find((g) => g.code === giftCode);
  if (!gift) {
    return res.status(404).json({ success: false, error: { code: 'GIFT_NOT_FOUND', message: 'Cadeau introuvable.' } });
  }

  const db = getDb();
  const ctx = await getMatchPartner(db, req.params.matchId, req.user.id);
  if (!ctx) {
    return res.status(404).json({ success: false, error: { code: 'MATCH_NOT_FOUND', message: 'Conversation introuvable.' } });
  }

  const debit = await spendCauris(db, req.user.id, gift.costCauris, `Cadeau ${gift.name} à ${ctx.partner.name}`, `GIFT-${gift.code}`);
  if (!debit.ok) {
    return res.status(402).json({
      success: false,
      error: { code: 'INSUFFICIENT_CAURIS', message: `${gift.costCauris} Cauris requis pour offrir ${gift.name}.` },
    });
  }

  const msgId = `msg_${crypto.randomUUID().slice(0, 12)}`;
  await db.run(
    `INSERT INTO messages (id, match_id, sender_id, recipient_id, msg_type, content, metadata_json)
     VALUES (?, ?, ?, ?, 'gift', ?, ?)`,
    msgId,
    ctx.match.id,
    req.user.id,
    ctx.partner.id,
    `${gift.emoji} ${req.user.name} t’a offert : ${gift.name} — "${gift.message}"`,
    JSON.stringify(gift)
  );

  const saved = await db.get('SELECT * FROM messages WHERE id = ?', msgId);
  emitToUser(ctx.partner.id, { type: 'message', matchId: ctx.match.id, message: saved });
  scheduleDemoReplyIfApplicable(db, ctx.match.id, req.user, ctx.partner, `cadeau ${gift.name}`);

  return res.status(201).json({
    success: true,
    data: {
      message: saved,
      caurisBalance: debit.balance,
    },
  });
}));

router.post('/:matchId/date-invite', requireAuth, asyncHandler(async (req, res) => {
  const { spotId, proposedDate = 'Ce week-end à 18h30', note = '' } = req.body || {};
  const db = getDb();
  const ctx = await getMatchPartner(db, req.params.matchId, req.user.id);
  if (!ctx) {
    return res.status(404).json({ success: false, error: { code: 'MATCH_NOT_FOUND', message: 'Conversation introuvable.' } });
  }
  const spot = await db.get('SELECT * FROM safe_date_spots WHERE id = ?', spotId);
  if (!spot) {
    return res.status(404).json({ success: false, error: { code: 'SPOT_NOT_FOUND', message: 'Lieu Safe Date introuvable.' } });
  }

  const cleanDate = String(proposedDate || 'Ce week-end à 18h30').trim().slice(0, 80);
  const cleanNote = String(note || '').trim().slice(0, 240);
  const msgId = `msg_${crypto.randomUUID().slice(0, 12)}`;
  const text = `Invitation Safe Date : ${spot.name} (${spot.commune}) • ${cleanDate}`;
  const metadata = {
    spot: { ...spot },
    proposedDate: cleanDate,
    note: cleanNote,
    status: 'pending',
    proposedBy: req.user.id,
  };

  await db.run(
    `INSERT INTO messages (id, match_id, sender_id, recipient_id, msg_type, content, metadata_json)
     VALUES (?, ?, ?, ?, 'date_invite', ?, ?)`,
    msgId,
    ctx.match.id,
    req.user.id,
    ctx.partner.id,
    text,
    JSON.stringify(metadata)
  );

  const saved = await db.get('SELECT * FROM messages WHERE id = ?', msgId);
  emitToUser(ctx.partner.id, { type: 'message', matchId: ctx.match.id, message: saved });
  scheduleDemoReplyIfApplicable(db, ctx.match.id, req.user, ctx.partner, 'safe date');

  return res.status(201).json({ success: true, data: { message: saved } });
}));

router.post('/:matchId/messages/:messageId/respond-date', requireAuth, asyncHandler(async (req, res) => {
  const { decision } = req.body || {};
  if (!['accepted', 'declined'].includes(decision)) {
    return res.status(422).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'decision doit être accepted ou declined.' },
    });
  }

  const db = getDb();
  const ctx = await getMatchPartner(db, req.params.matchId, req.user.id);
  if (!ctx) {
    return res.status(404).json({ success: false, error: { code: 'MATCH_NOT_FOUND', message: 'Conversation introuvable.' } });
  }

  const inviteMsg = await db.get(
    "SELECT * FROM messages WHERE id = ? AND match_id = ? AND msg_type = 'date_invite'",
    req.params.messageId,
    ctx.match.id
  );
  if (!inviteMsg) {
    return res.status(404).json({ success: false, error: { code: 'INVITE_NOT_FOUND', message: 'Invitation Safe Date introuvable.' } });
  }

  const meta = parseJsonSafe(inviteMsg.metadata_json, {});
  const nextMeta = {
    ...meta,
    status: decision,
    respondedBy: req.user.id,
    respondedAt: new Date().toISOString(),
  };

  await db.run('UPDATE messages SET metadata_json = ? WHERE id = ?', JSON.stringify(nextMeta), inviteMsg.id);
  const updatedInvite = await db.get('SELECT * FROM messages WHERE id = ?', inviteMsg.id);

  const spotName = meta.spot?.name || 'ce lieu Safe Date';
  const dateLabel = meta.proposedDate ? ` (${meta.proposedDate})` : '';
  const replyText =
    decision === 'accepted'
      ? `${req.user.name} a accepté le Safe Date à ${spotName}${dateLabel} !`
      : `${req.user.name} propose de replanifier le Safe Date à ${spotName}.`;

  const replyId = `msg_${crypto.randomUUID().slice(0, 12)}`;
  await db.run(
    `INSERT INTO messages (id, match_id, sender_id, recipient_id, msg_type, content)
     VALUES (?, ?, ?, ?, 'text', ?)`,
    replyId,
    ctx.match.id,
    req.user.id,
    ctx.partner.id,
    replyText
  );

  const replyMessage = await db.get('SELECT * FROM messages WHERE id = ?', replyId);
  emitToUser(ctx.partner.id, { type: 'message', matchId: ctx.match.id, message: replyMessage });

  return res.json({
    success: true,
    data: {
      inviteMessage: updatedInvite,
      replyMessage,
    },
  });
}));

export default router;
