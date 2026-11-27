import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { WebSocket } from 'ws';
import { config } from '../server/config.js';
import { setDbForTests } from '../server/db/database.js';
import { seedDatabase } from '../server/db/seed.js';
import { createApp } from '../server/app.js';
import { setupWebSocket } from '../server/ws/realtime.js';
import { signWebhookPayload } from '../server/services/geniusPayService.js';

let server;
let baseUrl;
let db;
let kouameToken;
let prevSimulatorFlag;

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
    prevSimulatorFlag = config.geniusPay.useLocalSimulator;
    config.geniusPay.useLocalSimulator = true;
    db = new DatabaseSync(':memory:');
    const schema = fs.readFileSync(path.join(config.rootDir, 'server/db/schema.sql'), 'utf-8');
    db.exec(schema);
    setDbForTests(db);
    seedDatabase(db);

    const app = createApp();
    server = http.createServer(app);
    setupWebSocket(server);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const addr = server.address();
    baseUrl = `http://127.0.0.1:${addr.port}`;
  });

  after(async () => {
    config.geniusPay.useLocalSimulator = prevSimulatorFlag;
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

  it('runs Bouclier Babi anti-scam sentinel and rejects fake selfie snapshots', async () => {
    const fakeSafety = await req('POST', '/safety/verify-selfie', {
      challengeCode: 'VICTORY_CHIN',
      selfieSnapshot: 'test_snapshot',
    }, kouameToken);
    assert.equal(fakeSafety.status, 422);
    assert.equal(fakeSafety.json.error.code, 'INVALID_SELFIE_IMAGE');

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

  it('preserves lookingFor="everyone"/"all" and gender="nonbinary" with reciprocal matching', async () => {
    const reg = await req('POST', '/auth/register', {
      email: 'akissi@akwaba.ci',
      password: 'Password123',
      name: 'Akissi',
      age: 27,
      gender: 'nonbinary',
      lookingFor: 'everyone',
      commune: 'Cocody • Riviera',
      city: 'Abidjan',
    });
    assert.equal(reg.status, 201);
    assert.equal(reg.json.data.user.gender, 'nonbinary');
    assert.equal(reg.json.data.user.lookingFor, 'everyone');

    const akissiToken = reg.json.data.token;
    const upd = await req('PUT', '/profiles/me', { lookingFor: 'all' }, akissiToken);
    assert.equal(upd.status, 200);
    assert.equal(upd.json.data.user.lookingFor, 'everyone');

    const disc = await req('GET', '/profiles/discover', null, akissiToken);
    assert.equal(disc.status, 200);
    const ids = disc.json.data.profiles.map((p) => p.id);
    // Aminata has looking_for='everyone', whereas Aya has looking_for='men'
    assert.ok(ids.includes('usr_aminata'));
    assert.ok(!ids.includes('usr_aya'));
  });

  it('exposes compatibility.breakdown, sharedQuizTraits, and trustBreakdown', async () => {
    const disc = await req('GET', '/profiles/discover?includeSwiped=true', null, kouameToken);
    assert.equal(disc.status, 200);
    const aya = disc.json.data.profiles.find((p) => p.id === 'usr_aya');
    assert.ok(aya);
    assert.equal(aya.compatibility.breakdown.baseline, 18);
    assert.equal(typeof aya.compatibility.breakdown.intention, 'number');
    assert.equal(typeof aya.compatibility.breakdown.culture, 'number');
    assert.equal(typeof aya.compatibility.breakdown.interests, 'number');
    assert.equal(typeof aya.compatibility.breakdown.geography, 'number');
    assert.ok(Array.isArray(aya.compatibility.sharedQuizTraits));
    assert.ok(aya.compatibility.sharedQuizTraits.length >= 1);
    assert.equal(aya.trustBreakdown.base, 40);
    assert.equal(aya.trustBreakdown.verified225, 25);

    const detail = await req('GET', '/profiles/usr_aya', null, kouameToken);
    assert.equal(detail.status, 200);
    assert.ok(detail.json.data.compatibility.breakdown);
    assert.ok(detail.json.data.profile.trustBreakdown);
  });

  it('updates Passeport Babi dates without double-charging Cauris', async () => {
    const before = await req('GET', '/wallet', null, kouameToken);
    const startBal = before.json.data.user.caurisBalance;

    const firstPass = await req(
      'POST',
      '/profiles/me/passport',
      { active: true, targetCity: 'Abidjan', arrivalDate: '2026-12-15', departureDate: '2027-01-05' },
      kouameToken
    );
    assert.equal(firstPass.status, 200);
    assert.equal(firstPass.json.data.user.passportActive, true);
    assert.equal(firstPass.json.data.user.passportArrivalDate, '2026-12-15');
    assert.equal(firstPass.json.data.user.passportDepartureDate, '2027-01-05');
    assert.equal(firstPass.json.data.user.caurisBalance, startBal - 200);

    const secondPass = await req(
      'POST',
      '/profiles/me/passport',
      { active: true, targetCity: 'Grand-Bassam', arrivalDate: '2026-12-20', departureDate: '2027-01-10' },
      kouameToken
    );
    assert.equal(secondPass.status, 200);
    assert.equal(secondPass.json.data.user.passportTargetCity, 'Grand-Bassam');
    assert.equal(secondPass.json.data.user.passportArrivalDate, '2026-12-20');
    assert.equal(secondPass.json.data.user.passportDepartureDate, '2027-01-10');
    assert.equal(secondPass.json.data.user.caurisBalance, startBal - 200);
  });

  it('handles secure avatar upload with magic-byte validation', async () => {
    const badAvatar = await req(
      'POST',
      '/profiles/me/avatar',
      { imageBase64: 'data:image/png;base64,SGVsbG8=' },
      kouameToken
    );
    assert.equal(badAvatar.status, 422);

    // Valid 1x1 PNG
    const validPng =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
    const goodAvatar = await req(
      'POST',
      '/profiles/me/avatar',
      { imageBase64: validPng },
      kouameToken
    );
    assert.equal(goodAvatar.status, 200);
    const url = goodAvatar.json.data.avatarUrl;
    assert.ok(url.startsWith('/uploads/avatars/'));
    const diskPath = path.join(config.uploadsDir, url.replace(/^\/uploads\//, ''));
    assert.ok(fs.existsSync(diskPath));
    fs.unlinkSync(diskPath);
  });

  it('supports contextual swipe reactionNote and interactive Safe Date invite + acceptance', async () => {
    const swipeRes = await req(
      'POST',
      '/swipes',
      {
        targetId: 'usr_sarah',
        action: 'like',
        reactionNote: 'Team Garba bien pimenté à l’arrivée à Port-Bouët !',
      },
      kouameToken
    );
    assert.equal(swipeRes.status, 200);
    assert.equal(swipeRes.json.data.isMatch, true);

    const sarahMsgs = await req('GET', `/chats/${swipeRes.json.data.match.id}/messages`, null, kouameToken);
    assert.equal(sarahMsgs.status, 200);
    assert.ok(
      sarahMsgs.json.data.messages.some((m) => m.content.includes('Team Garba bien pimenté'))
    );

    const inviteRes = await req(
      'POST',
      '/chats/match_kouame_aya/date-invite',
      { spotId: 'spot_zone4_rooftop', proposedDate: 'Vendredi 19h30', note: 'On admire la lagune ?' },
      kouameToken
    );
    assert.equal(inviteRes.status, 201);
    const inviteMsg = inviteRes.json.data.message;
    const inviteMeta = JSON.parse(inviteMsg.metadata_json);
    assert.equal(inviteMeta.status, 'pending');
    assert.equal(inviteMeta.note, 'On admire la lagune ?');
    assert.equal(inviteMeta.spot.id, 'spot_zone4_rooftop');

    const ayaLogin = await req('POST', '/auth/demo', { persona: 'aya' });
    assert.equal(ayaLogin.status, 200);
    const ayaToken = ayaLogin.json.data.token;

    const respondRes = await req(
      'POST',
      `/chats/match_kouame_aya/messages/${inviteMsg.id}/respond-date`,
      { decision: 'accepted' },
      ayaToken
    );
    assert.equal(respondRes.status, 200);
    const updatedMeta = JSON.parse(respondRes.json.data.inviteMessage.metadata_json);
    assert.equal(updatedMeta.status, 'accepted');
    assert.equal(updatedMeta.respondedBy, 'usr_aya');
    assert.ok(respondRes.json.data.replyMessage.content.includes('accepté'));
  });

  it('delivers real-time WebSocket typing events and covers safety challenge + sandbox completion', async () => {
    const challenge = await req('GET', '/safety/challenge', null, kouameToken);
    assert.equal(challenge.status, 200);
    assert.ok(challenge.json.data.breakdown);

    const ayaLogin = await req('POST', '/auth/demo', { persona: 'aya' });
    const ayaToken = ayaLogin.json.data.token;
    const wsPort = server.address().port;

    const wsK = new WebSocket(`ws://127.0.0.1:${wsPort}/ws?token=${encodeURIComponent(kouameToken)}`);
    const wsA = new WebSocket(`ws://127.0.0.1:${wsPort}/ws?token=${encodeURIComponent(ayaToken)}`);

    const eventsA = [];
    const eventsK = [];

    await Promise.all([
      new Promise((resolve) => {
        wsK.on('message', (d) => {
          const msg = JSON.parse(d.toString());
          eventsK.push(msg);
          if (msg.type === 'connected') resolve();
        });
      }),
      new Promise((resolve) => {
        wsA.on('message', (d) => {
          const msg = JSON.parse(d.toString());
          eventsA.push(msg);
          if (msg.type === 'connected') resolve();
        });
      }),
    ]);

    wsK.send(JSON.stringify({ type: 'ping' }));
    wsK.send(JSON.stringify({ type: 'typing', matchId: 'match_kouame_aya', recipientId: 'usr_aya' }));

    await new Promise((resolve) => setTimeout(resolve, 150));
    assert.ok(eventsK.some((e) => e.type === 'pong'));
    assert.ok(eventsA.some((e) => e.type === 'typing' && e.matchId === 'match_kouame_aya'));

    wsK.close();
    wsA.close();

    // Sandbox payment completion end-to-end
    const checkout = await req(
      'POST',
      '/payments/checkout',
      { itemCode: 'cauris_250', paymentMethod: 'orange_money' },
      kouameToken
    );
    assert.equal(checkout.status, 201);
    const completed = await req(
      'POST',
      '/payments/sandbox/complete',
      { reference: checkout.json.data.reference, paymentMethod: 'orange_money', outcome: 'success' },
      kouameToken
    );
    assert.equal(completed.status, 200);
    assert.equal(completed.json.data.webhookVerified, true);
    assert.equal(completed.json.data.order.status, 'completed');
  });

  it('orchestrates non-simulated GeniusPay API checkout and status reconciliation', async () => {
    const origFetch = globalThis.fetch;
    const origSim = config.geniusPay.useLocalSimulator;
    const origPub = config.geniusPay.publicKey;
    const origSec = config.geniusPay.secretKey;

    const balBefore = (await req('GET', '/wallet', null, kouameToken)).json.data.user.caurisBalance;

    try {
      config.geniusPay.useLocalSimulator = false;
      config.geniusPay.publicKey = 'pk_sandbox_test_key';
      config.geniusPay.secretKey = 'sk_sandbox_test_secret';

      globalThis.fetch = async (url, opts) => {
        const strUrl = String(url);
        if (strUrl.startsWith(config.geniusPay.baseUrl)) {
          if (strUrl.endsWith('/payments') && opts?.method === 'POST') {
            return new Response(
              JSON.stringify({
                success: true,
                message: 'Sandbox payment initiated successfully',
                data: {
                  id: 9001,
                  reference: 'SANDBOX_TEST9001',
                  amount: 500,
                  currency: 'XOF',
                  status: null,
                  gateway: 'wave',
                  checkout_url: 'https://geniuspay.ci/checkout/SANDBOX_TEST9001',
                  environment: 'sandbox',
                },
              }),
              { status: 201, headers: { 'Content-Type': 'application/json' } }
            );
          }
          if (strUrl.endsWith('/payments/SANDBOX_TEST9001')) {
            return new Response(
              JSON.stringify({
                success: true,
                data: {
                  id: 9001,
                  reference: 'SANDBOX_TEST9001',
                  amount: 500,
                  currency: 'XOF',
                  fees: 113,
                  net_amount: 387,
                  status: 'completed',
                  payment_method: 'wave',
                  environment: 'sandbox',
                },
              }),
              { status: 200, headers: { 'Content-Type': 'application/json' } }
            );
          }
        }
        return origFetch(url, opts);
      };

      const checkout = await req(
        'POST',
        '/payments/checkout',
        { itemCode: 'cauris_250', paymentMethod: 'wave', customerPhone: '+2250708112233' },
        kouameToken
      );
      assert.equal(checkout.status, 201);
      assert.equal(checkout.json.data.simulated, false);
      assert.equal(checkout.json.data.reference, 'SANDBOX_TEST9001');
      assert.equal(checkout.json.data.checkoutUrl, 'https://geniuspay.ci/checkout/SANDBOX_TEST9001');

      const statusRes = await req('GET', '/payments/SANDBOX_TEST9001/status', null, kouameToken);
      assert.equal(statusRes.status, 200);
      assert.equal(statusRes.json.data.order.status, 'completed');
      assert.equal(statusRes.json.data.order.fulfilled, 1);
      assert.equal(statusRes.json.data.user.caurisBalance, balBefore + 250);
    } finally {
      globalThis.fetch = origFetch;
      config.geniusPay.useLocalSimulator = origSim;
      config.geniusPay.publicKey = origPub;
      config.geniusPay.secretKey = origSec;
    }
  });

  it('enforces WhatsApp OTP flow (cooldown, wrong code, verify, replay ban, and Meta Cloud API call)', async () => {
    const reg = await req('POST', '/auth/register', {
      email: 'otpuser@akwaba.ci',
      password: 'Password123',
      name: 'Bamba',
      age: 28,
      gender: 'man',
      lookingFor: 'women',
      commune: 'Plateau',
      city: 'Abidjan',
    });
    assert.equal(reg.status, 201);
    const bambaToken = reg.json.data.token;
    const baseScore = reg.json.data.user.trustScore;

    // Legacy /auth/phone-verify without OTP code must fail
    const noCode = await req('POST', '/auth/phone-verify', { phone: '+2250708998877' }, bambaToken);
    assert.equal(noCode.status, 422);

    // 1. Request WhatsApp OTP in local simulator mode
    const reqOtp = await req('POST', '/auth/phone-otp/request', { phone: '07 08 99 88 77' }, bambaToken);
    assert.equal(reqOtp.status, 200);
    assert.equal(reqOtp.json.data.phone, '+2250708998877');
    assert.equal(reqOtp.json.data.channel, 'whatsapp');
    assert.equal(reqOtp.json.data.simulated, true);
    assert.match(reqOtp.json.data.devOtpCode, /^\d{6}$/);

    // 2. Cooldown blocks immediate spam retry
    const spamOtp = await req('POST', '/auth/phone-otp/request', { phone: '+2250708998877' }, bambaToken);
    assert.equal(spamOtp.status, 429);
    assert.equal(spamOtp.json.error.code, 'OTP_COOLDOWN');

    // 3. Wrong OTP fails and decrements remaining attempts
    const badCode = await req(
      'POST',
      '/auth/phone-otp/verify',
      { phone: '+2250708998877', code: '000000' },
      bambaToken
    );
    assert.equal(badCode.status, 422);
    assert.equal(badCode.json.error.code, 'INVALID_OTP');

    // 4. Correct OTP verifies phone and increases trustScore by +15
    const goodCode = await req(
      'POST',
      '/auth/phone-otp/verify',
      { phone: '+2250708998877', code: reqOtp.json.data.devOtpCode },
      bambaToken
    );
    assert.equal(goodCode.status, 200);
    assert.equal(goodCode.json.data.phoneVerified, true);
    assert.equal(goodCode.json.data.trustScore, baseScore + 15);

    // 5. Replaying already-used OTP fails
    const replay = await req(
      'POST',
      '/auth/phone-otp/verify',
      { phone: '+2250708998877', code: reqOtp.json.data.devOtpCode },
      bambaToken
    );
    assert.equal(replay.status, 404);

    // 6. Meta WhatsApp Cloud API live-mode payload test (mocked fetch)
    const origFetch = globalThis.fetch;
    const origWaSim = config.whatsapp.useLocalSimulator;
    const origWaToken = config.whatsapp.accessToken;
    const origWaPhoneId = config.whatsapp.phoneNumberId;
    let capturedWaPayload = null;
    try {
      config.whatsapp.useLocalSimulator = false;
      config.whatsapp.accessToken = 'EAAB_test_token';
      config.whatsapp.phoneNumberId = '123456789012345';
      globalThis.fetch = async (url, opts) => {
        if (String(url).includes('graph.facebook.com')) {
          capturedWaPayload = JSON.parse(opts.body);
          return new Response(JSON.stringify({ messages: [{ id: 'wamid.meta_ok' }] }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        return origFetch(url, opts);
      };

      const reg2 = await req('POST', '/auth/register', {
        email: 'waapi@akwaba.ci',
        password: 'Password123',
        name: 'Fanta',
        age: 26,
        gender: 'woman',
        lookingFor: 'men',
        commune: 'Cocody • Riviera',
        city: 'Abidjan',
      });
      const waReq = await req('POST', '/auth/phone-otp/request', { phone: '+2250501020304' }, reg2.json.data.token);
      assert.equal(waReq.status, 200);
      assert.equal(waReq.json.data.simulated, false);
      assert.equal(waReq.json.data.devOtpCode, undefined);
      assert.equal(capturedWaPayload.messaging_product, 'whatsapp');
      assert.equal(capturedWaPayload.to, '2250501020304');
      assert.equal(capturedWaPayload.type, 'template');
    } finally {
      globalThis.fetch = origFetch;
      config.whatsapp.useLocalSimulator = origWaSim;
      config.whatsapp.accessToken = origWaToken;
      config.whatsapp.phoneNumberId = origWaPhoneId;
    }
  });

  it('runs hybrid Selfie 225 verification (manual queue + admin review + Gemini Vision decisions)', async () => {
    const validPng =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

    const reg = await req('POST', '/auth/register', {
      email: 'selfieuser@akwaba.ci',
      password: 'Password123',
      name: 'Mariam',
      age: 25,
      gender: 'woman',
      lookingFor: 'men',
      commune: 'Marcory • Zone 4',
      city: 'Abidjan',
    });
    assert.equal(reg.status, 201);
    const mariamToken = reg.json.data.token;
    const initialScore = reg.json.data.user.trustScore;

    // 1. Without GEMINI_API_KEY -> goes to pending_review (NOT verified yet)
    const origGeminiKey = config.selfieAi.geminiApiKey;
    config.selfieAi.geminiApiKey = '';
    const subPending = await req(
      'POST',
      '/safety/verify-selfie',
      { challengeCode: 'VICTORY_CHIN', imageBase64: validPng },
      mariamToken
    );
    assert.equal(subPending.status, 200);
    assert.equal(subPending.json.data.status, 'pending_review');
    assert.equal(subPending.json.data.verified225, false);
    const verId = subPending.json.data.verificationId;

    // 2. Admin queue rejects missing/wrong secret
    const unauthQueue = await req('GET', '/safety/admin/verifications');
    assert.equal(unauthQueue.status, 401);

    // 3. Admin queue lists pending verification and streams private image
    const adminHeaders = { 'X-Admin-Secret': config.adminModerationSecret };
    const queue = await req('GET', '/safety/admin/verifications?status=pending_review', null, null, adminHeaders);
    assert.equal(queue.status, 200);
    assert.ok(queue.json.data.verifications.some((v) => v.id === verId));

    const imgRes = await fetch(`${baseUrl}/api/v1/safety/admin/verifications/${verId}/image`, {
      headers: adminHeaders,
    });
    assert.equal(imgRes.status, 200);
    assert.equal(imgRes.headers.get('content-type'), 'image/png');

    // 4. Admin approves -> badge granted + trustScore increases by +25
    const approve = await req(
      'POST',
      `/safety/admin/verifications/${verId}/review`,
      { decision: 'verified', note: 'Geste V conforme et visage net.' },
      null,
      adminHeaders
    );
    assert.equal(approve.status, 200);
    assert.equal(approve.json.data.verified225, true);
    assert.equal(approve.json.data.trustScore, initialScore + 25);

    // 5. Gemini Vision API high-confidence auto-verify & low-confidence rejection (mocked fetch)
    const origFetch = globalThis.fetch;
    try {
      config.selfieAi.geminiApiKey = 'AIza_test_key';
      let mockAiDecision = {
        face_detected: true,
        gesture_matches: false,
        matches_profile_photo: true,
        confidence: 0.22,
        reason: 'Le geste demandé n’est pas visible sur le cliché.',
      };
      globalThis.fetch = async (url, opts) => {
        if (String(url).includes('generativelanguage.googleapis.com')) {
          return new Response(
            JSON.stringify({
              candidates: [{ content: { parts: [{ text: JSON.stringify(mockAiDecision) }] } }],
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
        return origFetch(url, opts);
      };

      const regAi = await req('POST', '/auth/register', {
        email: 'aiverif@akwaba.ci',
        password: 'Password123',
        name: 'Yao',
        age: 29,
        gender: 'man',
        lookingFor: 'women',
        commune: 'Yopougon',
        city: 'Abidjan',
      });
      const yaoToken = regAi.json.data.token;

      // Rejected by Gemini Vision
      const rejRes = await req(
        'POST',
        '/safety/verify-selfie',
        { challengeCode: 'OPEN_PALM', imageBase64: validPng },
        yaoToken
      );
      assert.equal(rejRes.status, 200);
      assert.equal(rejRes.json.data.status, 'rejected');
      assert.equal(rejRes.json.data.verified225, false);

      // Approved by Gemini Vision
      mockAiDecision = {
        face_detected: true,
        gesture_matches: true,
        matches_profile_photo: true,
        confidence: 0.94,
        reason: 'Visage humain réel et main ouverte clairement visibles.',
      };
      const okRes = await req(
        'POST',
        '/safety/verify-selfie',
        { challengeCode: 'OPEN_PALM', imageBase64: validPng },
        yaoToken
      );
      assert.equal(okRes.status, 200);
      assert.equal(okRes.json.data.status, 'verified');
      assert.equal(okRes.json.data.verified225, true);
    } finally {
      globalThis.fetch = origFetch;
      config.selfieAi.geminiApiKey = origGeminiKey;
      // Clean up test private verification files created during this test
      const privDir = path.join(config.rootDir, 'data/private_verifications');
      if (fs.existsSync(privDir)) {
        for (const f of fs.readdirSync(privDir)) {
          if (f.startsWith('ver_')) {
            try { fs.unlinkSync(path.join(privDir, f)); } catch { /* ignore */ }
          }
        }
      }
    }
  });
});
