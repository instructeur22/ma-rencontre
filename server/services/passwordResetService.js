import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { config } from '../config.js';
import { hashOtpCode, normalizePhoneE164, sendWhatsAppOtpMessage } from './whatsappOtpService.js';

function timingSafeHexEqual(a, b) {
  const bufA = Buffer.from(String(a || ''), 'utf8');
  const bufB = Buffer.from(String(b || ''), 'utf8');
  if (bufA.length !== bufB.length || bufA.length === 0) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function hasWhatsappDeliveryConfigured() {
  return Boolean(!config.whatsapp.useLocalSimulator && config.whatsapp.accessToken && config.whatsapp.phoneNumberId);
}

function hasEmailDeliveryConfigured() {
  return Boolean(config.email?.resendApiKey || config.email?.webhookUrl);
}

async function sendResetEmail({ toEmail, userName, code }) {
  const subject = 'AKWABA — Code de réinitialisation de votre mot de passe';
  const textBody = `Bonjour ${userName || ''},\n\nVotre code de réinitialisation AKWABA (valable 10 minutes) est : ${code}\n\nSi vous n'êtes pas à l'origine de cette demande, ignorez ce message.`;

  if (config.email.resendApiKey) {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.email.resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: config.email.fromAddress,
        to: [toEmail],
        subject,
        text: textBody,
      }),
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      throw new Error(errJson?.message || `Échec d'envoi email Resend (HTTP ${res.status}).`);
    }
    return { channel: 'email', provider: 'resend', simulated: false };
  }

  if (config.email.webhookUrl) {
    const res = await fetch(config.email.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: toEmail, subject, text: textBody, code }),
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) {
      throw new Error(`Échec webhook email (HTTP ${res.status}).`);
    }
    return { channel: 'email', provider: 'email_webhook', simulated: false };
  }

  return null;
}

async function findUserByIdentifier(db, rawIdentifier) {
  const clean = String(rawIdentifier || '').trim();
  if (!clean) return null;
  if (clean.includes('@')) {
    return db.get('SELECT * FROM users WHERE lower(email) = lower(?)', clean);
  }
  const normalizedPhone = normalizePhoneE164(clean);
  if (normalizedPhone) {
    return db.get('SELECT * FROM users WHERE phone = ?', normalizedPhone);
  }
  return db.get('SELECT * FROM users WHERE lower(email) = lower(?) OR phone = ?', clean, clean);
}

/**
 * Send a 6-digit password reset code via WhatsApp (priority if user has phone & configured) or Email.
 */
export async function requestPasswordReset(db, rawIdentifier) {
  const identifier = String(rawIdentifier || '').trim();
  if (!identifier) {
    return {
      ok: false,
      status: 422,
      code: 'VALIDATION_ERROR',
      message: 'Veuillez saisir votre email ou votre numéro WhatsApp.',
    };
  }

  const whatsappReady = hasWhatsappDeliveryConfigured();
  const emailReady = hasEmailDeliveryConfigured();
  if (!config.allowSandboxSimulators && !whatsappReady && !emailReady) {
    return {
      ok: false,
      status: 503,
      code: 'RESET_DELIVERY_UNAVAILABLE',
      message: 'Aucun canal de réinitialisation (WhatsApp ou Email) n’est encore configuré sur ce serveur.',
    };
  }

  const user = await findUserByIdentifier(db, identifier);
  if (!user) {
    return {
      ok: true,
      status: 200,
      data: {
        sent: true,
        simulated: false,
        message: 'Si un compte correspond à cet identifiant, un code à 6 chiffres vient d’être envoyé.',
      },
    };
  }

  const latest = await db.get(
    `SELECT id, created_at FROM password_reset_challenges
     WHERE user_id = ? AND used_at IS NULL
     ORDER BY created_at DESC LIMIT 1`,
    user.id
  );

  if (latest?.created_at) {
    const createdMs = Date.parse(latest.created_at);
    const cooldownMs = 45_000;
    if (Number.isFinite(createdMs) && Date.now() - createdMs < cooldownMs) {
      const retryAfterSec = Math.max(1, Math.ceil((cooldownMs - (Date.now() - createdMs)) / 1000));
      return {
        ok: false,
        status: 429,
        code: 'RESET_COOLDOWN',
        retryAfterSec,
        message: `Un code vient déjà d’être envoyé. Réessayez dans ${retryAfterSec} s.`,
      };
    }
  }

  const code = String(crypto.randomInt(100000, 1000000));
  const salt = crypto.randomBytes(16).toString('hex');
  const codeHash = hashOtpCode(code, salt);
  const nowIso = new Date().toISOString();
  const expiresIso = new Date(Date.now() + 10 * 60_000).toISOString();
  const challengeId = `pwd_${crypto.randomUUID().slice(0, 12)}`;

  let delivery = null;
  if (user.phone && whatsappReady) {
    const waRes = await sendWhatsAppOtpMessage({ phoneE164: user.phone, code });
    delivery = { channel: 'whatsapp', provider: waRes.provider, simulated: false };
  } else if (user.email && emailReady) {
    delivery = await sendResetEmail({ toEmail: user.email, userName: user.name, code });
  } else if (config.allowSandboxSimulators) {
    delivery = { channel: user.phone ? 'whatsapp' : 'email', provider: 'local_simulator', simulated: true };
  } else {
    return {
      ok: false,
      status: 503,
      code: 'RESET_DELIVERY_UNAVAILABLE',
      message: 'Impossible d’envoyer le code sur un canal actif pour ce compte.',
    };
  }

  await db.run(
    `INSERT INTO password_reset_challenges (
      id, user_id, identifier, channel, code_hash, salt, attempts, max_attempts, expires_at, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, 0, 5, ?, ?)`,
    challengeId,
    user.id,
    identifier.slice(0, 120),
    delivery.channel,
    codeHash,
    salt,
    expiresIso,
    nowIso
  );

  const data = {
    sent: true,
    channel: delivery.channel,
    provider: delivery.provider,
    simulated: Boolean(delivery.simulated),
    expiresInSec: 600,
    message: delivery.simulated
      ? `Mode simulateur local : code généré via ${delivery.channel}.`
      : `Si un compte correspond à cet identifiant, un code à 6 chiffres a été envoyé via ${delivery.channel === 'whatsapp' ? 'WhatsApp' : 'Email'}.`,
  };

  if (delivery.simulated && config.allowSandboxSimulators) {
    data.devResetCode = code;
  }

  return { ok: true, status: 200, data };
}

/**
 * Verify reset code and update the user's bcrypt password hash.
 */
export async function confirmPasswordReset(db, { identifier, code, newPassword }) {
  const cleanIdentifier = String(identifier || '').trim();
  const cleanCode = String(code || '').trim();

  if (!cleanIdentifier || !/^\d{6}$/.test(cleanCode)) {
    return {
      ok: false,
      status: 422,
      code: 'INVALID_RESET_CODE',
      message: 'Identifiant et code à 6 chiffres requis.',
    };
  }
  if (!newPassword || String(newPassword).length < 8) {
    return {
      ok: false,
      status: 422,
      code: 'WEAK_PASSWORD',
      message: 'Le nouveau mot de passe doit contenir au moins 8 caractères.',
    };
  }

  const user = await findUserByIdentifier(db, cleanIdentifier);
  if (!user) {
    return {
      ok: false,
      status: 422,
      code: 'INVALID_RESET_CODE',
      message: 'Code invalide ou expiré.',
    };
  }

  const challenge = await db.get(
    `SELECT * FROM password_reset_challenges
     WHERE user_id = ? AND used_at IS NULL
     ORDER BY created_at DESC LIMIT 1`,
    user.id
  );

  if (!challenge) {
    return { ok: false, status: 404, code: 'RESET_NOT_FOUND', message: 'Aucune demande de réinitialisation active.' };
  }
  if (Date.parse(challenge.expires_at) <= Date.now()) {
    return { ok: false, status: 410, code: 'RESET_EXPIRED', message: 'Ce code a expiré. Demandez un nouveau code.' };
  }
  if (Number(challenge.attempts) >= Number(challenge.max_attempts)) {
    return { ok: false, status: 429, code: 'RESET_MAX_ATTEMPTS', message: 'Trop de tentatives. Demandez un nouveau code.' };
  }

  const nextAttempts = Number(challenge.attempts) + 1;
  await db.run('UPDATE password_reset_challenges SET attempts = ? WHERE id = ?', nextAttempts, challenge.id);

  const expectedHash = hashOtpCode(cleanCode, challenge.salt);
  if (!timingSafeHexEqual(expectedHash, challenge.code_hash)) {
    const remaining = Math.max(0, Number(challenge.max_attempts) - nextAttempts);
    return {
      ok: false,
      status: 422,
      code: 'INVALID_RESET_CODE',
      message: `Code incorrect (${remaining} essai${remaining > 1 ? 's' : ''} restant${remaining > 1 ? 's' : ''}).`,
    };
  }

  const nowIso = new Date().toISOString();
  const nextHash = bcrypt.hashSync(String(newPassword), 10);
  await db.run('UPDATE password_reset_challenges SET used_at = ? WHERE id = ?', nowIso, challenge.id);
  await db.run('UPDATE users SET password_hash = ? WHERE id = ?', nextHash, user.id);

  return {
    ok: true,
    status: 200,
    data: { reset: true, message: 'Mot de passe mis à jour avec succès.' },
  };
}
