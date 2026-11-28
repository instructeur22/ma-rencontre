import crypto from 'node:crypto';
import { config } from '../config.js';
import { computeTrustScore } from './antiScamService.js';

const E164_REGEX = /^\+[1-9]\d{7,14}$/;
const CI_LOCAL_10_REGEX = /^0[157]\d{8}$/;

export function normalizePhoneE164(rawPhone) {
  if (typeof rawPhone !== 'string' && typeof rawPhone !== 'number') {
    return null;
  }
  let cleaned = String(rawPhone).trim().replace(/[\s\-().]/g, '');
  if (!cleaned) return null;

  if (cleaned.startsWith('00')) {
    cleaned = `+${cleaned.slice(2)}`;
  } else if (CI_LOCAL_10_REGEX.test(cleaned)) {
    cleaned = `+225${cleaned}`;
  } else if (/^2250[157]\d{8}$/.test(cleaned)) {
    cleaned = `+${cleaned}`;
  }

  if (!E164_REGEX.test(cleaned)) {
    return null;
  }
  return cleaned;
}

export function hashOtpCode(code, salt) {
  return crypto.createHmac('sha256', String(salt)).update(String(code)).digest('hex');
}

function timingSafeHexEqual(a, b) {
  const bufA = Buffer.from(String(a || ''), 'utf8');
  const bufB = Buffer.from(String(b || ''), 'utf8');
  if (bufA.length !== bufB.length || bufA.length === 0) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export async function sendWhatsAppOtpMessage({ phoneE164, code }) {
  if (!config.whatsapp.useLocalSimulator && config.whatsapp.accessToken && config.whatsapp.phoneNumberId) {
    const endpoint = `https://graph.facebook.com/${config.whatsapp.apiVersion}/${encodeURIComponent(
      config.whatsapp.phoneNumberId
    )}/messages`;

    const payload = {
      messaging_product: 'whatsapp',
      to: phoneE164.replace(/^\+/, ''),
      type: 'template',
      template: {
        name: config.whatsapp.otpTemplateName,
        language: { code: config.whatsapp.otpTemplateLang },
        components: [
          {
            type: 'body',
            parameters: [{ type: 'text', text: String(code) }],
          },
          {
            type: 'button',
            sub_type: 'url',
            index: '0',
            parameters: [{ type: 'text', text: String(code) }],
          },
        ],
      },
    };

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.whatsapp.accessToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(12_000),
    });

    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = json?.error?.message || `Échec d’envoi WhatsApp Cloud API (HTTP ${res.status}).`;
      throw new Error(msg);
    }

    return {
      delivered: true,
      simulated: false,
      provider: 'meta_whatsapp_cloud_api',
      messageId: json?.messages?.[0]?.id || '',
    };
  }

  return {
    delivered: true,
    simulated: true,
    provider: 'whatsapp_local_simulator',
    messageId: `wamid.sim_${crypto.randomUUID().slice(0, 12)}`,
  };
}

export async function requestWhatsAppOtp(db, userId, rawPhone) {
  if (
    !config.allowSandboxSimulators &&
    (config.whatsapp.useLocalSimulator || !config.whatsapp.accessToken || !config.whatsapp.phoneNumberId)
  ) {
    return {
      ok: false,
      status: 503,
      code: 'WHATSAPP_UNAVAILABLE',
      message: 'Le service WhatsApp OTP n’est pas encore configuré sur ce serveur.',
    };
  }

  const phoneE164 = normalizePhoneE164(rawPhone);
  if (!phoneE164) {
    return {
      ok: false,
      status: 422,
      code: 'INVALID_PHONE',
      message: 'Numéro WhatsApp invalide (format attendu : +2250700000000 ou 0700000000).',
    };
  }

  const latest = await db.get(
    `SELECT id, created_at, verified_at FROM phone_otp_challenges
     WHERE user_id = ? AND phone_e164 = ? AND verified_at IS NULL
     ORDER BY created_at DESC LIMIT 1`,
    userId,
    phoneE164
  );

  if (latest?.created_at) {
    const createdMs = Date.parse(latest.created_at);
    const cooldownMs = Math.max(0, Number(config.whatsapp.cooldownSec || 45)) * 1000;
    if (Number.isFinite(createdMs) && Date.now() - createdMs < cooldownMs) {
      const retryAfterSec = Math.max(1, Math.ceil((cooldownMs - (Date.now() - createdMs)) / 1000));
      return {
        ok: false,
        status: 429,
        code: 'OTP_COOLDOWN',
        retryAfterSec,
        message: `Un code WhatsApp vient déjà d’être envoyé. Réessayez dans ${retryAfterSec} s.`,
      };
    }
  }

  const code = String(crypto.randomInt(100000, 1000000));
  const salt = crypto.randomBytes(16).toString('hex');
  const codeHash = hashOtpCode(code, salt);
  const nowIso = new Date().toISOString();
  const ttlSec = Math.max(60, Number(config.whatsapp.ttlSec || 300));
  const expiresIso = new Date(Date.now() + ttlSec * 1000).toISOString();
  const challengeId = `otp_${crypto.randomUUID().slice(0, 12)}`;

  const delivery = await sendWhatsAppOtpMessage({ phoneE164, code });

  await db.run(
    `INSERT INTO phone_otp_challenges (
      id, user_id, phone_e164, code_hash, salt, channel, attempts, max_attempts, expires_at, created_at
    ) VALUES (?, ?, ?, ?, ?, 'whatsapp', 0, 5, ?, ?)`,
    challengeId,
    userId,
    phoneE164,
    codeHash,
    salt,
    expiresIso,
    nowIso
  );

  const responseData = {
    challengeId,
    phone: phoneE164,
    channel: 'whatsapp',
    provider: delivery.provider,
    simulated: delivery.simulated,
    expiresInSec: ttlSec,
    message: delivery.simulated
      ? `Code WhatsApp généré en mode simulateur local pour ${phoneE164}.`
      : `Code de vérification envoyé sur WhatsApp au ${phoneE164}.`,
  };

  if (delivery.simulated && config.allowSandboxSimulators) {
    responseData.devOtpCode = code;
  }

  return { ok: true, status: 200, data: responseData };
}

export async function verifyWhatsAppOtp(db, userId, rawPhone, rawCode) {
  const phoneE164 = normalizePhoneE164(rawPhone);
  if (!phoneE164) {
    return {
      ok: false,
      status: 422,
      code: 'INVALID_PHONE',
      message: 'Numéro de téléphone invalide.',
    };
  }

  const cleanCode = String(rawCode || '').trim();
  if (!/^\d{6}$/.test(cleanCode)) {
    return {
      ok: false,
      status: 422,
      code: 'INVALID_OTP_FORMAT',
      message: 'Un code WhatsApp valide à 6 chiffres est requis.',
    };
  }

  const challenge = await db.get(
    `SELECT * FROM phone_otp_challenges
     WHERE user_id = ? AND phone_e164 = ? AND verified_at IS NULL
     ORDER BY created_at DESC LIMIT 1`,
    userId,
    phoneE164
  );

  if (!challenge) {
    return {
      ok: false,
      status: 404,
      code: 'OTP_NOT_FOUND',
      message: 'Aucun code WhatsApp actif pour ce numéro. Demandez un nouveau code.',
    };
  }

  if (Date.parse(challenge.expires_at) <= Date.now()) {
    return {
      ok: false,
      status: 410,
      code: 'OTP_EXPIRED',
      message: 'Ce code WhatsApp a expiré. Demandez un nouveau code.',
    };
  }

  if (Number(challenge.attempts) >= Number(challenge.max_attempts)) {
    return {
      ok: false,
      status: 429,
      code: 'OTP_MAX_ATTEMPTS',
      message: 'Nombre maximal d’essais atteint. Demandez un nouveau code WhatsApp.',
    };
  }

  const nextAttempts = Number(challenge.attempts) + 1;
  await db.run('UPDATE phone_otp_challenges SET attempts = ? WHERE id = ?', nextAttempts, challenge.id);

  const expectedHash = hashOtpCode(cleanCode, challenge.salt);
  if (!timingSafeHexEqual(expectedHash, challenge.code_hash)) {
    const remaining = Math.max(0, Number(challenge.max_attempts) - nextAttempts);
    return {
      ok: false,
      status: 422,
      code: 'INVALID_OTP',
      remainingAttempts: remaining,
      message: `Code WhatsApp incorrect (${remaining} essai${remaining > 1 ? 's' : ''} restant${remaining > 1 ? 's' : ''}).`,
    };
  }

  const nowIso = new Date().toISOString();
  await db.run('UPDATE phone_otp_challenges SET verified_at = ? WHERE id = ?', nowIso, challenge.id);
  await db.run('UPDATE users SET phone = ?, phone_verified = 1 WHERE id = ?', phoneE164, userId);
  const trustScore = await computeTrustScore(db, userId);

  return {
    ok: true,
    status: 200,
    data: {
      phone: phoneE164,
      phoneVerified: true,
      channel: 'whatsapp',
      trustScore,
    },
  };
}
