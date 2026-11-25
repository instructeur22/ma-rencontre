import crypto from 'node:crypto';
import { config } from '../config.js';

export const GENIUSPAY_METHODS = [
  {
    code: 'wave',
    label: 'Wave Côte d’Ivoire',
    badge: 'Le plus rapide • Frais bas',
    operatorFeePct: 0.015,
    geniusFeePct: 0.01,
    geniusFixedXof: 100,
    countries: ['CI', 'SN'],
  },
  {
    code: 'orange_money',
    label: 'Orange Money',
    badge: 'Mobile Money #1 UEMOA',
    operatorFeePct: 0.035,
    geniusFeePct: 0.01,
    geniusFixedXof: 100,
    countries: ['CI', 'SN', 'ML', 'BF'],
  },
  {
    code: 'mtn_money',
    label: 'MTN MoMo',
    badge: 'Instantané CI',
    operatorFeePct: 0.035,
    geniusFeePct: 0.01,
    geniusFixedXof: 100,
    countries: ['CI', 'BJ', 'CM'],
  },
  {
    code: 'moov_money',
    label: 'Moov Money',
    badge: 'Mobile Money CI & Togo',
    operatorFeePct: 0.035,
    geniusFeePct: 0.01,
    geniusFixedXof: 100,
    countries: ['CI', 'TG', 'BJ'],
  },
  {
    code: 'card',
    label: 'Carte Visa / Mastercard',
    badge: 'Diaspora & International',
    operatorFeePct: 0.05,
    geniusFeePct: 0.01,
    geniusFixedXof: 100,
    countries: ['ALL'],
  },
];

export function estimateGeniusPayFees(amountXof, methodCode = 'wave') {
  const method = GENIUSPAY_METHODS.find((m) => m.code === methodCode) || GENIUSPAY_METHODS[0];
  const fees = Math.round(amountXof * (method.operatorFeePct + method.geniusFeePct) + method.geniusFixedXof);
  const netAmount = Math.max(0, amountXof - fees);
  return { fees, netAmount, method: method.code };
}

export function generateReference(prefix = 'MTX') {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 10; i++) {
    code += chars[crypto.randomInt(0, chars.length)];
  }
  return `${prefix}-${code}`;
}

export function signWebhookPayload(payloadOrRaw, timestampSec, secret = config.geniusPay.webhookSecret) {
  const serialized = typeof payloadOrRaw === 'string' ? payloadOrRaw : JSON.stringify(payloadOrRaw);
  const data = `${timestampSec}.${serialized}`;
  return crypto.createHmac('sha256', secret).update(data).digest('hex');
}

export function verifyWebhookSignature({
  signature,
  timestamp,
  payload,
  rawBody = null,
  secret = config.geniusPay.webhookSecret,
  maxAgeSec = 300,
}) {
  if (!signature || !timestamp || (!payload && typeof rawBody !== 'string')) {
    return { ok: false, error: 'Missing webhook signature headers or payload' };
  }
  const nowSec = Math.floor(Date.now() / 1000);
  const tsNum = Number(timestamp);
  if (!Number.isFinite(tsNum) || Math.abs(nowSec - tsNum) > maxAgeSec) {
    return { ok: false, error: 'Webhook timestamp expired or invalid (anti-replay)' };
  }

  const bodyToVerify = typeof rawBody === 'string' && rawBody.length > 0 ? rawBody : payload;
  const expected = signWebhookPayload(bodyToVerify, timestamp, secret);
  const sigBuf = Buffer.from(String(signature), 'utf8');
  const expBuf = Buffer.from(expected, 'utf8');
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return { ok: false, error: 'Invalid HMAC-SHA256 webhook signature' };
  }
  return { ok: true };
}

export async function createGeniusPayPayment({
  amount,
  currency = 'XOF',
  paymentMethod = null,
  description,
  customer,
  metadata,
  successUrl,
  errorUrl,
}) {
  if (!Number.isFinite(Number(amount)) || Number(amount) < 200) {
    throw new Error('Montant minimum GeniusPay : 200 XOF');
  }

  // Real GeniusPay HTTP API call when merchant API keys are configured
  if (!config.geniusPay.useLocalSimulator && config.geniusPay.publicKey && config.geniusPay.secretKey) {
    const body = {
      amount: Number(amount),
      currency,
      description,
      customer,
      success_url: successUrl,
      error_url: errorUrl,
      metadata,
    };
    if (paymentMethod) {
      body.payment_method = paymentMethod;
    }

    const res = await fetch(`${config.geniusPay.baseUrl}/payments`, {
      method: 'POST',
      headers: {
        'X-API-Key': config.geniusPay.publicKey,
        'X-API-Secret': config.geniusPay.secretKey,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });

    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.success) {
      const msg = json?.error?.message || json?.message || 'Erreur API GeniusPay';
      throw new Error(msg);
    }

    const data = json.data || {};
    const feesEstimate =
      data.fees !== undefined && data.fees !== null
        ? Number(data.fees)
        : estimateGeniusPayFees(Number(amount), paymentMethod || data.gateway || 'wave').fees;
    const netEstimate =
      data.net_amount !== undefined && data.net_amount !== null
        ? Number(data.net_amount)
        : Math.max(0, Number(amount) - feesEstimate);

    return {
      mode: config.geniusPay.env,
      simulated: false,
      ...data,
      fees: feesEstimate,
      net_amount: netEstimate,
    };
  }

  // Local faithful Sandbox Simulator matching exact GeniusPay response schema
  const reference = generateReference('MTX');
  const numericAmount = Number(amount);
  const { fees, netAmount } = estimateGeniusPayFees(numericAmount, paymentMethod || 'wave');
  const checkoutUrl = `${config.appBaseUrl}/?checkout_ref=${encodeURIComponent(reference)}`;

  return {
    id: crypto.randomInt(10000, 999999),
    reference,
    amount: numericAmount,
    currency,
    fees,
    net_amount: netAmount,
    status: 'pending',
    payment_method: paymentMethod || null,
    gateway: paymentMethod || 'checkout',
    checkout_url: checkoutUrl,
    payment_url: checkoutUrl,
    environment: 'sandbox',
    simulated: true,
    metadata: metadata || {},
    expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  };
}

export async function fetchGeniusPayPaymentStatus(reference) {
  if (!config.geniusPay.useLocalSimulator && config.geniusPay.publicKey && config.geniusPay.secretKey) {
    const res = await fetch(`${config.geniusPay.baseUrl}/payments/${encodeURIComponent(reference)}`, {
      headers: {
        'X-API-Key': config.geniusPay.publicKey,
        'X-API-Secret': config.geniusPay.secretKey,
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    const json = await res.json().catch(() => null);
    return json?.data || null;
  }
  return null;
}
