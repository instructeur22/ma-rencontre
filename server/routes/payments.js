import express from 'express';
import crypto from 'node:crypto';
import { config } from '../config.js';
import { getDb, normalizeRows } from '../db/database.js';
import { requireAuth } from '../middleware/auth.js';
import {
  createGeniusPayPayment,
  fetchGeniusPayPaymentStatus,
  signWebhookPayload,
  verifyWebhookSignature,
} from '../services/geniusPayService.js';
import {
  STORE_CATALOG,
  claimDailyCheckin,
  findCatalogItem,
  fulfillPaymentOrder,
} from '../services/monetizationService.js';
import { parseJsonSafe } from '../services/matchingService.js';
import { formatSelfUser } from './auth.js';
import { emitToUser } from '../ws/realtime.js';

const router = express.Router();

router.get('/store/catalog', (req, res) => {
  return res.json({
    success: true,
    data: STORE_CATALOG,
  });
});

router.get('/wallet', requireAuth, (req, res) => {
  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  const transactions = normalizeRows(
    db.prepare('SELECT * FROM wallet_transactions WHERE user_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 30').all(user.id)
  );
  const orders = normalizeRows(
    db.prepare('SELECT * FROM payment_orders WHERE user_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 20').all(user.id)
  );

  return res.json({
    success: true,
    data: {
      user: formatSelfUser(user),
      transactions,
      orders,
    },
  });
});

router.post('/wallet/daily-checkin', requireAuth, (req, res) => {
  const db = getDb();
  const result = claimDailyCheckin(db, req.user.id);
  return res.status(result.ok ? 200 : 400).json({
    success: result.ok,
    data: result,
  });
});

router.post('/payments/checkout', requireAuth, async (req, res) => {
  const { itemCode, paymentMethod = null, customerPhone = '', provider = 'geniuspay' } = req.body || {};
  const item = findCatalogItem(itemCode);
  if (!item) {
    return res.status(404).json({
      success: false,
      error: { code: 'ITEM_NOT_FOUND', message: 'Produit ou Pass introuvable dans le catalogue.' },
    });
  }

  if (provider !== 'geniuspay') {
    return res.status(400).json({
      success: false,
      error: {
        code: 'STORE_PROVIDER_INFO',
        message: 'Sur le Web, utilisez GeniusPay (Wave, Orange Money, MTN, Moov, Carte). Sur Flutter Stores, apple_iap/google_play synchronisera le reçu serveur.',
      },
    });
  }

  try {
    const db = getDb();
    const orderId = `ORD-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
    const metadata = {
      order_id: orderId,
      user_id: req.user.id,
      item_code: item.code,
      item_type: item.itemType,
      product_name: item.name,
    };

    const gpResponse = await createGeniusPayPayment({
      amount: item.priceXof,
      currency: 'XOF',
      paymentMethod: paymentMethod || null,
      description: `AKWABA • ${item.name}`,
      customer: {
        name: req.user.name,
        email: req.user.email,
        phone: customerPhone || req.user.phone || '+2250700000000',
        country: req.user.country_code || 'CI',
      },
      successUrl: `${config.appBaseUrl}/?payment=success&ref=${orderId}`,
      errorUrl: `${config.appBaseUrl}/?payment=error&ref=${orderId}`,
      metadata,
    });

    db.prepare(
      `INSERT INTO payment_orders (
        id, reference, user_id, provider, payment_method, item_code, item_type,
        amount_xof, fees_xof, net_amount_xof, currency, status, checkout_url,
        customer_phone, metadata_json, environment
      ) VALUES (?, ?, ?, 'geniuspay', ?, ?, ?, ?, ?, ?, 'XOF', 'pending', ?, ?, ?, ?)`
    ).run(
      orderId,
      gpResponse.reference,
      req.user.id,
      gpResponse.payment_method || paymentMethod || '',
      item.code,
      item.itemType,
      gpResponse.amount,
      gpResponse.fees || 0,
      gpResponse.net_amount || gpResponse.amount,
      gpResponse.checkout_url || gpResponse.payment_url || '',
      customerPhone || req.user.phone || '',
      JSON.stringify(metadata),
      gpResponse.environment || config.geniusPay.env
    );

    return res.status(201).json({
      success: true,
      data: {
        orderId,
        reference: gpResponse.reference,
        amountXof: gpResponse.amount,
        feesXof: gpResponse.fees || 0,
        netAmountXof: gpResponse.net_amount || gpResponse.amount,
        currency: 'XOF',
        status: 'pending',
        checkoutUrl: gpResponse.checkout_url || gpResponse.payment_url,
        environment: gpResponse.environment || 'sandbox',
        simulated: Boolean(gpResponse.simulated),
        item,
      },
    });
  } catch (err) {
    return res.status(400).json({
      success: false,
      error: { code: 'PAYMENT_INIT_FAILED', message: err.message },
    });
  }
});

router.get('/payments/:reference/status', requireAuth, async (req, res) => {
  try {
    const db = getDb();
    const order = db.prepare('SELECT * FROM payment_orders WHERE reference = ? AND user_id = ?').get(req.params.reference, req.user.id);
    if (!order) {
      return res.status(404).json({ success: false, error: { code: 'TRANSACTION_NOT_FOUND', message: 'Transaction introuvable.' } });
    }

    if (order.status === 'pending' && !config.geniusPay.useLocalSimulator) {
      const remote = await fetchGeniusPayPaymentStatus(order.reference);
      if (remote && remote.status === 'completed') {
        fulfillPaymentOrder(db, order.reference, remote);
      }
    }

    const refreshed = db.prepare('SELECT * FROM payment_orders WHERE reference = ?').get(order.reference);
    const updatedUser = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);

    return res.json({
      success: true,
      data: {
        order: { ...refreshed },
        user: formatSelfUser(updatedUser),
      },
    });
  } catch (err) {
    return res.status(502).json({
      success: false,
      error: { code: 'PAYMENT_STATUS_ERROR', message: err.message },
    });
  }
});

// Sandbox checkout completion endpoint: constructs a REAL GeniusPay HMAC-SHA256 webhook & processes it
router.post('/payments/sandbox/complete', requireAuth, (req, res) => {
  const { reference, paymentMethod = 'wave', outcome = 'success' } = req.body || {};
  if (!reference) {
    return res.status(422).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'reference requise.' } });
  }
  const db = getDb();
  const order = db.prepare('SELECT * FROM payment_orders WHERE reference = ? AND user_id = ?').get(reference, req.user.id);
  if (!order) {
    return res.status(404).json({ success: false, error: { code: 'TRANSACTION_NOT_FOUND', message: 'Commande introuvable.' } });
  }

  if (!config.geniusPay.useLocalSimulator && config.geniusPay.env === 'live') {
    return res.status(403).json({ success: false, error: { code: 'SANDBOX_ONLY', message: 'Simulation interdite en mode Live.' } });
  }

  const eventType = outcome === 'success' ? 'payment.success' : 'payment.failed';
  const timestamp = String(Math.floor(Date.now() / 1000));
  const payload = {
    id: crypto.randomUUID(),
    event: eventType,
    timestamp: Number(timestamp),
    created_at: new Date().toISOString(),
    data: {
      object: 'transaction',
      reference: order.reference,
      amount: order.amount_xof,
      currency: 'XOF',
      fees: order.fees_xof,
      net_amount: order.net_amount_xof,
      status: outcome === 'success' ? 'completed' : 'failed',
      payment_method: paymentMethod,
      provider: paymentMethod,
      customer_name: req.user.name,
      customer_phone: order.customer_phone,
      metadata: parseJsonSafe(order.metadata_json, {}),
    },
    environment: 'sandbox',
    api_version: '2024-01-01',
  };

  const rawPayload = JSON.stringify(payload);
  const signature = signWebhookPayload(rawPayload, timestamp, config.geniusPay.webhookSecret);
  const check = verifyWebhookSignature({ signature, timestamp, payload, rawBody: rawPayload });
  if (!check.ok) {
    return res.status(401).json({ success: false, error: { code: 'INVALID_SIGNATURE', message: check.error } });
  }

  let fulfillment = null;
  if (eventType === 'payment.success') {
    fulfillment = fulfillPaymentOrder(db, order.reference, payload.data);
    emitToUser(order.user_id, {
      type: 'payment_completed',
      reference: order.reference,
      grantedSummary: fulfillment.grantedSummary,
    });
  } else {
    db.prepare("UPDATE payment_orders SET status = 'failed' WHERE reference = ? AND fulfilled = 0").run(order.reference);
  }

  const updatedUser = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  const updatedOrder = db.prepare('SELECT * FROM payment_orders WHERE reference = ?').get(order.reference);

  return res.json({
    success: true,
    data: {
      webhookVerified: true,
      eventType,
      fulfillment,
      order: { ...updatedOrder },
      user: formatSelfUser(updatedUser),
    },
  });
});

// Official GeniusPay Webhook Receiver (HMAC-SHA256 verified against rawBody)
router.post('/webhooks/geniuspay', (req, res) => {
  const signature = req.header('X-Webhook-Signature');
  const timestamp = req.header('X-Webhook-Timestamp');
  const eventHeader = req.header('X-Webhook-Event');
  const payload = req.body;

  const verification = verifyWebhookSignature({
    signature,
    timestamp,
    payload,
    rawBody: req.rawBody || null,
  });

  if (!verification.ok) {
    return res.status(401).json({
      success: false,
      error: { code: 'INVALID_WEBHOOK_SIGNATURE', message: verification.error },
    });
  }

  const event = eventHeader || payload?.event;
  const reference = payload?.data?.reference;
  const db = getDb();

  if (reference) {
    if (event === 'payment.success' || event === 'payment.completed') {
      const result = fulfillPaymentOrder(db, reference, payload.data);
      if (!result.ok && result.error?.includes('Montant')) {
        return res.status(422).json({
          success: false,
          error: { code: 'AMOUNT_MISMATCH', message: result.error },
        });
      }
      if (result.ok && result.order && !result.alreadyFulfilled) {
        emitToUser(result.order.user_id, {
          type: 'payment_completed',
          reference,
          grantedSummary: result.grantedSummary,
        });
      }
    } else if (event === 'payment.failed' || event === 'payment.cancelled' || event === 'payment.expired') {
      const nextStatus = event.replace('payment.', '');
      db.prepare('UPDATE payment_orders SET status = ? WHERE reference = ? AND fulfilled = 0').run(nextStatus, reference);
    }
  }

  return res.json({ received: true, event, reference });
});

export default router;
