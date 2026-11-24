import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../server/config.js';
import { setDbForTests } from '../server/db/database.js';
import { seedDatabase } from '../server/db/seed.js';
import { createApp } from '../server/app.js';
import { signWebhookPayload } from '../server/services/geniusPayService.js';

let server;
let baseUrl;
let db;
let kouameToken;

async function req(method, endpoint, body = null, token = null, extraHeaders = {}) {
  const headers = { 'Content-Type': 'application/json', ...extraHeaders };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${baseUrl}/api/v1${endpoint}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

describe('AKWABA API & GeniusPay Integration Suite', () => {
  before(async () => {
    db = new DatabaseSync(':memory:');
    const schema = fs.readFileSync(path.join(config.rootDir, 'server/db/schema.sql'), 'utf-8');
    db.exec(schema);
    setDbForTests(db);
    seedDatabase(db);

    const app = createApp();
    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const addr = server.address();
    baseUrl = `http://127.0.0.1:${addr.port}`;
  });

  after(async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
    if (db) db.close();
  });

  it('returns healthy status and full store catalog', async () => {
    const h = await req('GET', '/health');
    assert.equal(h.status, 200);
    assert.equal(h.json.success, true);

    const cat = await req('GET', '/store/catalog');
    assert.equal(cat.status, 200);
    assert.equal(cat.json.data.subscriptions.length, 3);
    assert.equal(cat.json.data.caurisPacks.length, 3);
    assert.ok(cat.json.data.paymentMethods.some((m) => m.code === 'wave'));
  });

  it('enforces 18+ age gate and handles registration + referral rewards', async () => {
    const underage = await req('POST', '/auth/register', {
      email: 'mineur@akwaba.ci',
      password: 'Password123',
      name: 'Junior',
      age: 17,
    });
    assert.equal(underage.status, 422);

    const reg = await req('POST', '/auth/register', {
      email: 'saliou@akwaba.ci',
      password: 'Password123',
      name: 'Saliou',
      age: 26,
      gender: 'man',
      lookingFor: 'women',
      commune: 'Cocody • Riviera',
      city: 'Abidjan',
      referralCodeUsed: 'AKW-AYA225',
    });
    assert.equal(reg.status, 201);
    assert.ok(reg.json.data.token);
    // 50 welcome + 50 referral bonus = 100 Cauris
    assert.equal(reg.json.data.user.caurisBalance, 100);

    const ayaRow = db.prepare('SELECT cauris_balance FROM users WHERE id = ?').get('usr_aya');
    // Aya started with 200 + 100 referral = 300
    assert.equal(Number(ayaRow.cauris_balance), 300);
  });

  it('logs in demo user Kouamé and computes Vrai Babi compatibility scores', async () => {
    const login = await req('POST', '/auth/login', {
      email: 'kouame@akwaba.ci',
      password: 'Akwaba225!',
    });
    assert.equal(login.status, 200);
    kouameToken = login.json.data.token;
    assert.equal(login.json.data.user.name, 'Kouamé');

    const disc = await req('GET', '/profiles/discover?verifiedOnly=true', null, kouameToken);
    assert.equal(disc.status, 200);
    assert.ok(disc.json.data.profiles.length >= 2);
    for (const p of disc.json.data.profiles) {
      assert.equal(p.verified225, true);
      assert.ok(p.compatibility.score >= 45 && p.compatibility.score <= 99);
      assert.ok(p.compatibility.reasons.length >= 1);
    }
  });

  it('supports swipes, pass rewind, and admirer reveal', async () => {
    const disc = await req('GET', '/profiles/discover', null, kouameToken);
    const first = disc.json.data.profiles[0];
    assert.ok(first);

    const passRes = await req('POST', '/swipes', { targetId: first.id, action: 'pass' }, kouameToken);
    assert.equal(passRes.status, 200);

    const rewindRes = await req('POST', '/swipes/rewind', null, kouameToken);
    assert.equal(rewindRes.status, 200);
    assert.equal(rewindRes.json.data.restoredProfile.id, first.id);

    const likesRes = await req('GET', '/likes/received', null, kouameToken);
    assert.equal(likesRes.status, 200);
    assert.ok(likesRes.json.data.admirers.some((a) => a.profile.id === 'usr_nadia'));

    const revealRes = await req('POST', '/likes/usr_nadia/reveal', null, kouameToken);
    assert.equal(revealRes.status, 200);
    assert.equal(revealRes.json.data.profile.name, 'Nadia');
  });

  it('runs Bouclier Babi anti-scam sentinel and selfie verification', async () => {
    const safetyRes = await req('POST', '/safety/verify-selfie', {
      challengeCode: 'VICTORY_CHIN',
      selfieSnapshot: 'test_snapshot',
    }, kouameToken);
    assert.equal(safetyRes.status, 200);
    assert.equal(safetyRes.json.data.verified225, true);

    const scamMsg = await req(
      'POST',
      '/chats/match_kouame_aya/messages',
      { content: 'Coucou envoie-moi un dépôt Wave urgent par Western Union stp' },
      kouameToken
    );
    assert.equal(scamMsg.status, 201);
    assert.equal(scamMsg.json.data.scamCheck.flagged, true);
    assert.equal(scamMsg.json.data.scamCheck.severity, 'high');
    assert.equal(scamMsg.json.data.message.scam_flagged, 1);
  });

  it('handles cultural gifts, daily checkin, GeniusPay checkout, HMAC webhook security, and idempotency', async () => {
    const checkin = await req('POST', '/wallet/daily-checkin', null, kouameToken);
    assert.equal(checkin.status, 200);
    assert.equal(checkin.json.data.reward, 15);

    const gift = await req('POST', '/chats/match_kouame_aya/gift', { giftCode: 'rose_abidjan' }, kouameToken);
    assert.equal(gift.status, 201);

    const walletBefore = await req('GET', '/wallet', null, kouameToken);
    const balanceBefore = walletBefore.json.data.user.caurisBalance;

    // 1. Initiate GeniusPay Checkout for Pass Babi Gold (3 500 FCFA, +500 Cauris bonus)
    const checkout = await req(
      'POST',
      '/payments/checkout',
      { itemCode: 'babi_gold', paymentMethod: 'wave', customerPhone: '+2250708112233' },
      kouameToken
    );
    assert.equal(checkout.status, 201);
    const ref = checkout.json.data.reference;
    assert.ok(ref.startsWith('MTX-'));
    assert.equal(checkout.json.data.amountXof, 3500);

    // 2. Reject forged webhook signature
    const payload = {
      event: 'payment.success',
      data: { reference: ref, amount: 3500, payment_method: 'wave', status: 'completed' },
    };
    const ts = String(Math.floor(Date.now() / 1000));
    const forged = await req('POST', '/webhooks/geniuspay', payload, null, {
      'X-Webhook-Signature': 'forged_sig',
      'X-Webhook-Timestamp': ts,
      'X-Webhook-Event': 'payment.success',
    });
    assert.equal(forged.status, 401);

    // 3. Reject expired timestamp replay attack
    const oldTs = String(Math.floor(Date.now() / 1000) - 600);
    const oldSig = signWebhookPayload(payload, oldTs);
    const replayed = await req('POST', '/webhooks/geniuspay', payload, null, {
      'X-Webhook-Signature': oldSig,
      'X-Webhook-Timestamp': oldTs,
      'X-Webhook-Event': 'payment.success',
    });
    assert.equal(replayed.status, 401);

    // 4. Process valid HMAC-SHA256 webhook
    const validSig = signWebhookPayload(payload, ts);
    const okHook = await req('POST', '/webhooks/geniuspay', payload, null, {
      'X-Webhook-Signature': validSig,
      'X-Webhook-Timestamp': ts,
      'X-Webhook-Event': 'payment.success',
    });
    assert.equal(okHook.status, 200);
    assert.equal(okHook.json.received, true);

    // 5. Verify idempotency on duplicate delivery
    const dupHook = await req('POST', '/webhooks/geniuspay', payload, null, {
      'X-Webhook-Signature': validSig,
      'X-Webhook-Timestamp': ts,
      'X-Webhook-Event': 'payment.success',
    });
    assert.equal(dupHook.status, 200);

    const walletAfter = await req('GET', '/wallet', null, kouameToken);
    assert.equal(walletAfter.json.data.user.subscriptionTier, 'babi_gold');
    // +500 Cauris granted exactly once
    assert.equal(walletAfter.json.data.user.caurisBalance, balanceBefore + 500);
  });

  it('creates Safe Date bookings via GeniusPay', async () => {
    const spots = await req('GET', '/dates/spots', null, kouameToken);
    assert.equal(spots.status, 200);
    assert.equal(spots.json.data.spots.length, 3);

    const booking = await req(
      'POST',
      '/dates/bookings',
      { spotId: 'spot_cocody_bistro', guestsCount: 2, paymentMethod: 'orange_money', customerPhone: '+2250708112233' },
      kouameToken
    );
    assert.equal(booking.status, 201);
    assert.equal(booking.json.data.totalXof, 10000);
    assert.ok(booking.json.data.reference.startsWith('MTX-'));
  });

  it('enforces XSS avatar guards, self-action bans, report deduplication, block isolation, and rawBody HMAC integrity', async () => {
    // 1. Reject javascript: URI in avatarUrl
    const badAvatar = await req(
      'PUT',
      '/profiles/me',
      { avatarUrl: 'javascript:alert(1)' },
      kouameToken
    );
    assert.equal(badAvatar.status, 422);
    assert.equal(badAvatar.json.error.code, 'INVALID_AVATAR_URL');

    // 2. Reject self-swipe, self-DM, and self-report
    const selfSwipe = await req('POST', '/swipes', { targetId: 'usr_kouame', action: 'like' }, kouameToken);
    assert.equal(selfSwipe.status, 422);
    const selfDm = await req('POST', '/chats/direct', { targetId: 'usr_kouame', content: 'Hello' }, kouameToken);
    assert.equal(selfDm.status, 422);
    const selfRep = await req('POST', '/safety/report', { targetId: 'usr_kouame' }, kouameToken);
    assert.equal(selfRep.status, 422);

    // 3. Deduplicate repeated reports from same reporter & enforce block isolation
    const rep1 = await req('POST', '/safety/report', { targetId: 'usr_maimouna', alsoBlock: true }, kouameToken);
    assert.equal(rep1.status, 200);
    const scoreAfterFirst = rep1.json.data.targetTrustScore;
    const rep2 = await req('POST', '/safety/report', { targetId: 'usr_maimouna', alsoBlock: true }, kouameToken);
    assert.equal(rep2.status, 200);
    assert.equal(rep2.json.data.targetTrustScore, scoreAfterFirst);

    const blockedProfile = await req('GET', '/profiles/usr_maimouna', null, kouameToken);
    assert.equal(blockedProfile.status, 404);
    const blockedDm = await req('POST', '/chats/direct', { targetId: 'usr_maimouna', content: 'Salut' }, kouameToken);
    assert.equal(blockedDm.status, 403);

    // 4. Verify rawBody HMAC with pretty-printed JSON + reject underpaid webhook + keep completed order immutable
    const checkout = await req(
      'POST',
      '/payments/checkout',
      { itemCode: 'cauris_250', paymentMethod: 'wave' },
      kouameToken
    );
    assert.equal(checkout.status, 201);
    const ref = checkout.json.data.reference;
    const ts = String(Math.floor(Date.now() / 1000));

    // Underpaid amount tampering (100 FCFA instead of 500 FCFA)
    const underpaidRaw = JSON.stringify(
      { event: 'payment.success', data: { reference: ref, amount: 100, status: 'completed' } },
      null,
      2
    );
    const underpaidSig = signWebhookPayload(underpaidRaw, ts);
    const underpaidRes = await fetch(`${baseUrl}/api/v1/webhooks/geniuspay`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Signature': underpaidSig,
        'X-Webhook-Timestamp': ts,
        'X-Webhook-Event': 'payment.success',
      },
      body: underpaidRaw,
    });
    assert.equal(underpaidRes.status, 422);

    // Valid pretty-printed rawBody webhook
    const validRaw = JSON.stringify(
      { event: 'payment.success', data: { reference: ref, amount: 500, payment_method: 'wave', status: 'completed' } },
      null,
      2
    );
    const validSig = signWebhookPayload(validRaw, ts);
    const validRes = await fetch(`${baseUrl}/api/v1/webhooks/geniuspay`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Signature': validSig,
        'X-Webhook-Timestamp': ts,
        'X-Webhook-Event': 'payment.success',
      },
      body: validRaw,
    });
    assert.equal(validRes.status, 200);

    // Late out-of-order payment.failed webhook must NOT overwrite completed status
    const failRaw = JSON.stringify({ event: 'payment.failed', data: { reference: ref, status: 'failed' } });
    const failSig = signWebhookPayload(failRaw, ts);
    await fetch(`${baseUrl}/api/v1/webhooks/geniuspay`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Signature': failSig,
        'X-Webhook-Timestamp': ts,
        'X-Webhook-Event': 'payment.failed',
      },
      body: failRaw,
    });
    const orderRow = db.prepare('SELECT status, fulfilled FROM payment_orders WHERE reference = ?').get(ref);
    assert.equal(orderRow.status, 'completed');
    assert.equal(orderRow.fulfilled, 1);
  });
});
