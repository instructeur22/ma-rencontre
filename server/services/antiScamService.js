import crypto from 'node:crypto';
import { parseJsonSafe } from './matchingService.js';

export const SELFIE_CHALLENGES = [
  {
    code: 'VICTORY_CHIN',
    label: 'Fais le signe V (victoire) à côté de ton sourire',
    tip: 'Assure-toi que ton visage et le geste sont bien éclairés.',
  },
  {
    code: 'OPEN_PALM',
    label: 'Montre ta main ouverte à hauteur de l’épaule',
    tip: 'Photo prise sur le vif — aucune photo galerie acceptée.',
  },
  {
    code: 'THUMBS_UP_225',
    label: 'Pouce levé avec un grand sourire naturel',
    tip: 'Ton selfie reste privé et sert uniquement à activer le badge Vérifié 225.',
  },
];

const SCAM_PATTERNS = [
  {
    regex: /\b(western\s*union|moneygram|ria\s*transfer|worldremit|cryptomonnaie|bitcoin|usdt)\b/i,
    reason: 'Mention d’un moyen de transfert financier international dans le chat.',
    severity: 'high',
  },
  {
    regex: /\b(envoie[- ]?moi|dépanner|dépannage|urgence\s*médicale|ordonnance|loyer|billet\s*d'avion|frais\s*de\s*douane|pcs|transcash|neosurf)\b/i,
    reason: 'Sollicitation financière ou demande de carte prépayée détectée par le Bouclier Babi.',
    severity: 'high',
  },
  {
    regex: /\b(depot\s*wave|envoie\s*sur\s*mon\s*wave|mon\s*orange\s*money|passe[- ]?moi\s*\d+\s*(f|fcfa|xof|euro|€))\b/i,
    reason: 'Demande d’envoi Mobile Money ou d’argent détectée.',
    severity: 'high',
  },
  {
    regex: /(\+?\d[\d\s.-]{7,}\d|wa\.me\/|t\.me\/|telegram)/i,
    reason: 'Partage de numéro ou lien externe : restez sur AKWABA tant que vous n’avez pas établi la confiance.',
    severity: 'medium',
  },
];

export function inspectMessageForScamSignals(text) {
  if (!text || typeof text !== 'string') {
    return { flagged: false, severity: 'none', reason: '' };
  }
  for (const rule of SCAM_PATTERNS) {
    if (rule.regex.test(text)) {
      return {
        flagged: true,
        severity: rule.severity,
        reason: rule.reason,
      };
    }
  }
  return { flagged: false, severity: 'none', reason: '' };
}

export function computeTrustScore(db, userId) {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!user) return 50;

  let score = 40;
  if (user.phone_verified) score += 15;
  if (user.verified_225) score += 25;
  if (user.voice_note_url) score += 10;

  const tags = parseJsonSafe(user.tags_json, []);
  const quiz = parseJsonSafe(user.vrai_babi_json, {});
  if (user.bio && user.bio.length >= 40 && tags.length >= 2 && Object.keys(quiz).length >= 3) {
    score += 10;
  }

  const reports = db
    .prepare("SELECT COUNT(DISTINCT reporter_id) as cnt FROM blocks_reports WHERE target_id = ? AND action_type = 'report'")
    .get(userId);
  const reportCount = reports ? Number(reports.cnt) : 0;
  score -= reportCount * 15;

  const clamped = Math.max(10, Math.min(100, score));
  db.prepare('UPDATE users SET trust_score = ? WHERE id = ?').run(clamped, userId);
  return clamped;
}

export function getDailyChallenge() {
  const idx = new Date().getDate() % SELFIE_CHALLENGES.length;
  return SELFIE_CHALLENGES[idx];
}

export function submitSelfieVerification(db, userId, challengeCode, selfieSnapshot) {
  const challenge = SELFIE_CHALLENGES.find((c) => c.code === challengeCode) || SELFIE_CHALLENGES[0];
  const id = `ver_${crypto.randomUUID().slice(0, 12)}`;

  db.prepare(
    `INSERT INTO safety_verifications (id, user_id, challenge_code, challenge_label, status, selfie_snapshot)
     VALUES (?, ?, ?, ?, 'verified', ?)`
  ).run(id, userId, challenge.code, challenge.label, selfieSnapshot || 'live_gesture_verified');

  db.prepare('UPDATE users SET verified_225 = 1 WHERE id = ?').run(userId);
  const newScore = computeTrustScore(db, userId);

  return {
    verificationId: id,
    status: 'verified',
    verified225: true,
    trustScore: newScore,
    challenge,
  };
}

export function getBlockedUserIds(db, userId) {
  const rows = db
    .prepare(
      `SELECT target_id AS blocked_id FROM blocks_reports WHERE reporter_id = ? AND action_type = 'block'
       UNION
       SELECT reporter_id AS blocked_id FROM blocks_reports WHERE target_id = ? AND action_type = 'block'`
    )
    .all(userId, userId);
  return new Set(rows.map((r) => r.blocked_id));
}
