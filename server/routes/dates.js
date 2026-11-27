import express from 'express';
import crypto from 'node:crypto';
import { config } from '../config.js';
import { getDb, normalizeRows, runInTransaction } from '../db/database.js';
import { requireAuth } from '../middleware/auth.js';
import { createGeniusPayPayment } from '../services/geniusPayService.js';

const router = express.Router();

router.get('/spots', requireAuth, (req, res) => {
  const db = getDb();
  const { commune = 'all' } = req.query;
  let spots = normalizeRows(db.prepare('SELECT * FROM safe_date_spots').all());
  if (commune !== 'all') {
    spots = spots.filter((s) => s.commune.toLowerCase().includes(String(commune).toLowerCase()));
  }
  const myBookings = normalizeRows(
    db
      .prepare(
        `SELECT b.*, s.name AS spot_name, s.commune AS spot_commune
         FROM date_bookings b
         JOIN safe_date_spots s ON s.id = b.spot_id
         WHERE b.user_id = ?
         ORDER BY b.created_at DESC`
      )
      .all(req.user.id)
  );

  return res.json({
    success: true,
    data: { spots, myBookings },
  });
});

router.post('/bookings', requireAuth, async (req, res) => {
  if (config.nodeEnv === 'production' && config.geniusPay.useLocalSimulator) {
    return res.status(503).json({
      success: false,
      error: {
        code: 'PAYMENT_UNAVAILABLE',
        message: 'Les paiements GeniusPay ne sont pas encore configurés sur ce serveur.',
      },
    });
  }
  try {
    const { spotId, bookingDate = 'Ce week-end', guestsCount = 2, paymentMethod = 'wave', customerPhone = '' } = req.body || {};
    const db = getDb();
    const spot = db.prepare('SELECT * FROM safe_date_spots WHERE id = ?').get(spotId);
    if (!spot) {
      return res.status(404).json({ success: false, error: { code: 'SPOT_NOT_FOUND', message: 'Lieu Safe Date introuvable.' } });
    }

    const guests = Math.max(1, Math.min(6, Number(guestsCount) || 2));
    const totalXof = Number(spot.ticket_price_xof) * guests;
    const bookingId = `book_${crypto.randomUUID().slice(0, 10)}`;
    const orderId = `ORD-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;

    const metadata = {
      order_id: orderId,
      booking_id: bookingId,
      user_id: req.user.id,
      spot_id: spot.id,
      item_code: `event_${spot.id}`,
      item_type: 'event_ticket',
    };

    const gp = await createGeniusPayPayment({
      amount: totalXof,
      currency: 'XOF',
      paymentMethod,
      description: `Safe Date AKWABA • ${spot.name} (${guests} places)`,
      customer: {
        name: req.user.name,
        email: req.user.email,
        phone: customerPhone || req.user.phone || '+2250700000000',
        country: req.user.country_code || 'CI',
      },
      successUrl: `${config.appBaseUrl}/?payment=success&booking=${bookingId}`,
      errorUrl: `${config.appBaseUrl}/?payment=error&booking=${bookingId}`,
      metadata,
    });

    runInTransaction(db, () => {
      db.prepare(
        `INSERT INTO date_bookings (id, spot_id, user_id, booking_date, guests_count, total_xof, payment_reference, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')`
      ).run(bookingId, spot.id, req.user.id, String(bookingDate).slice(0, 80), guests, totalXof, gp.reference);

      db.prepare(
        `INSERT INTO payment_orders (
          id, reference, user_id, provider, payment_method, item_code, item_type,
          amount_xof, fees_xof, net_amount_xof, currency, status, checkout_url,
          customer_phone, metadata_json, environment
        ) VALUES (?, ?, ?, 'geniuspay', ?, ?, 'event_ticket', ?, ?, ?, 'XOF', 'pending', ?, ?, ?, ?)`
      ).run(
        orderId,
        gp.reference,
        req.user.id,
        paymentMethod || 'wave',
        `event_${spot.id}`,
        totalXof,
        gp.fees || 0,
        gp.net_amount || totalXof,
        gp.checkout_url || gp.payment_url || '',
        customerPhone || req.user.phone || '',
        JSON.stringify(metadata),
        gp.environment || 'sandbox'
      );
    });

    return res.status(201).json({
      success: true,
      data: {
        bookingId,
        reference: gp.reference,
        totalXof,
        checkoutUrl: gp.checkout_url || gp.payment_url,
        environment: gp.environment || config.geniusPay.env,
        simulated: Boolean(gp.simulated),
        spot: { ...spot },
      },
    });
  } catch (err) {
    return res.status(400).json({
      success: false,
      error: { code: 'BOOKING_INIT_FAILED', message: err.message },
    });
  }
});

export default router;
