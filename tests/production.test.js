import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { WebSocket } from 'ws';

const tempDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'akwaba-prod-test-'));
process.env.NODE_ENV = 'production';
process.env.JWT_SECRET = 'akwaba_production_test_jwt_secret_minimum_32_chars_225';
process.env.ADMIN_MODERATION_SECRET = 'akwaba_prod_mod_secret_225';
process.env.APP_BASE_URL = 'https://akwaba.ci';
process.env.CORS_ORIGIN = 'https://akwaba.ci';
process.env.DATA_DIR = tempDataDir;
process.env.UPLOADS_DIR = path.join(tempDataDir, 'uploads');
process.env.GENIUSPAY_LOCAL_SIMULATOR = 'true';
process.env.WHATSAPP_LOCAL_SIMULATOR = 'true';
process.env.GEMINI_API_KEY = '';
process.env.RESEND_API_KEY = '';

const { config } = await import('../server/config.js');
const { setDbForTests } = await import('../server/db/database.js');
const { seedDatabase } = await import('../server/db/seed.js');
const { createApp } = await import('../server/app.js');
const { setupWebSocket } = await import('../server/ws/realtime.js');
const { createHotBackup } = await import('../scripts/backup-db.js');

let server;
let baseUrl;
let db;

async function req(method, endpoint, body = null, token = null, extraHeaders = {}) {
  const headers = { 'Content-Type': 'application/json', ...extraHeaders };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${baseUrl}/api/v1${endpoint}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, headers: res.headers, json };
}

describe('AKWABA Production Hardening Suite', () => {
  before(async () => {
    db = new DatabaseSync(':memory:');
    const schema = fs.readFileSync(path.join(config.rootDir, 'server/db/schema.sql'), 'utf-8');
    db.exec(schema);
    setDbForTests(db);
    seedDatabase(db);

    const app = createApp();
    server = http.createServer(app);
    setupWebSocket(server);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  after(async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
    if (db) db.close();
    fs.rmSync(tempDataDir, { recursive: true, force: true });
  });

  it('seeds zero demo users in production, exposes public-config safely, and enforces strict HTTP headers', async () => {
    const usersCount = db.prepare('SELECT COUNT(*) AS cnt FROM users').get().cnt;
    const spotsCount = db.prepare('SELECT COUNT(*) AS cnt FROM safe_date_spots').get().cnt;
    assert.equal(Number(usersCount), 0);
    assert.equal(Number(spotsCount), 3);

    const cfgRes = await req('GET', '/public-config', null, null, { Origin: 'https://akwaba.ci' });
    assert.equal(cfgRes.status, 200);
    assert.equal(cfgRes.json.data.environment, 'production');
    assert.equal(cfgRes.json.data.demoEnabled, false);
    assert.equal(cfgRes.json.data.paymentSandboxUi, false);
    assert.equal(cfgRes.headers.get('access-control-allow-origin'), 'https://akwaba.ci');
    assert.equal(cfgRes.headers.get('x-frame-options'), 'DENY');
    assert.ok(cfgRes.headers.get('strict-transport-security')?.includes('max-age=31536000'));
    assert.ok(cfgRes.headers.get('content-security-policy')?.includes("script-src 'self'"));

    const foreignOrigin = await req('GET', '/public-config', null, null, { Origin: 'https://evil.example' });
    assert.equal(foreignOrigin.headers.get('access-control-allow-origin'), null);

    const demoAttempt = await req('POST', '/auth/demo', { persona: 'kouame' });
    assert.equal(demoAttempt.status, 403);
  });

  it('enforces phone & acceptedTerms on production registration and isolates proxy IPs', async () => {
    const noTerms = await req('POST', '/auth/register', {
      email: 'noterms@akwaba.ci',
      password: 'Password225!',
      name: 'Kadi',
      age: 26,
      phone: '+2250708001122',
    });
    assert.equal(noTerms.status, 422);
    assert.equal(noTerms.json.error.code, 'TERMS_REQUIRED');

    const noPhone = await req('POST', '/auth/register', {
      email: 'nophone@akwaba.ci',
      password: 'Password225!',
      name: 'Kadi',
      age: 26,
      acceptedTerms: true,
    });
    assert.equal(noPhone.status, 422);
    assert.equal(noPhone.json.error.code, 'PHONE_REQUIRED');

    // Simulate 26 distinct users behind reverse proxy -> none should be blocked by another IP
    for (let i = 1; i <= 26; i += 1) {
      const r = await req(
        'POST',
        '/auth/login',
        { email: `proxy${i}@akwaba.ci`, password: 'WrongPassword1' },
        null,
        { 'X-Forwarded-For': `196.170.50.${i}` }
      );
      assert.equal(r.status, 401);
    }

    // Same X-Forwarded-For repeating 26 times -> blocked with 429
    let blockedStatus = 401;
    for (let i = 0; i < 26; i += 1) {
      const r = await req(
        'POST',
        '/auth/login',
        { email: 'spammer@akwaba.ci', password: 'WrongPassword1' },
        null,
        { 'X-Forwarded-For': '196.170.99.99' }
      );
      blockedStatus = r.status;
    }
    assert.equal(blockedStatus, 429);
  });

  it('locks unconfigured GeniusPay & WhatsApp endpoints fail-closed and blocks external avatar URLs in prod', async () => {
    const reg = await req('POST', '/auth/register', {
      email: 'produser@akwaba.ci',
      password: 'Password225!',
      name: 'Salif',
      age: 28,
      phone: '0708445566',
      acceptedTerms: true,
    });
    assert.equal(reg.status, 201);
    const token = reg.json.data.token;
    assert.equal(reg.json.data.user.phone, '+2250708445566');

    const cat = await req('GET', '/store/catalog');
    const firstItemCode = cat.json.data.caurisPacks[0].code;
    const co = await req('POST', '/payments/checkout', { itemCode: firstItemCode, paymentMethod: 'wave' }, token);
    assert.equal(co.status, 503);
    assert.equal(co.json.error.code, 'PAYMENT_UNAVAILABLE');

    const bk = await req('POST', '/dates/bookings', { spotId: 'spot_cocody_bistro', paymentMethod: 'wave' }, token);
    assert.equal(bk.status, 503);

    const sb = await req('POST', '/payments/sandbox/complete', { reference: 'MTX-FAKE', outcome: 'success' }, token);
    assert.equal(sb.status, 403);
    assert.equal(sb.json.error.code, 'SANDBOX_DISABLED');

    const otp = await req('POST', '/auth/phone-otp/request', { phone: '+2250708445566' }, token);
    assert.equal(otp.status, 503);
    assert.equal(otp.json.error.code, 'WHATSAPP_UNAVAILABLE');

    const extAvatar = await req('PUT', '/profiles/me', { avatarUrl: 'https://tracker.evil/img.png' }, token);
    assert.equal(extAvatar.status, 422);
    assert.equal(extAvatar.json.error.code, 'INVALID_AVATAR_URL');
  });

  it('requires single-use WS tickets in prod, supports password reset/change, and purges account + disk media on delete', async () => {
    const validPng =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

    const reg = await req('POST', '/auth/register', {
      email: 'lifecycle@akwaba.ci',
      password: 'Password225!',
      name: 'Aicha',
      age: 25,
      phone: '+2250708223344',
      acceptedTerms: true,
    });
    assert.equal(reg.status, 201);
    let token = reg.json.data.token;
    const userId = reg.json.data.user.id;

    // Upload avatar, voice, and selfie into DATA_DIR
    const av = await req('POST', '/profiles/me/avatar', { imageBase64: validPng }, token);
    assert.equal(av.status, 200);
    const avatarFile = path.join(config.uploadsDir, av.json.data.avatarUrl.replace(/^\/uploads\//, ''));
    assert.equal(fs.existsSync(avatarFile), true);

    const self = await req('POST', '/safety/verify-selfie', { challengeCode: 'OPEN_PALM', imageBase64: validPng }, token);
    assert.equal(self.status, 200);
    const verId = self.json.data.verificationId;
    const selfieFile = path.join(config.dataDir, 'private_verifications', `${verId}.png`);
    assert.equal(fs.existsSync(selfieFile), true);

    // WS rejects raw JWT token in production, accepts single-use ticket once
    const wsUrl = baseUrl.replace('http://', 'ws://');
    const rawJwtRejectedCode = await new Promise((resolve) => {
      const ws = new WebSocket(`${wsUrl}/ws?token=${encodeURIComponent(token)}`);
      ws.on('close', (code) => resolve(code));
    });
    assert.equal(rawJwtRejectedCode, 4003);

    const ticketRes = await req('POST', '/auth/ws-ticket', null, token);
    assert.equal(ticketRes.status, 200);
    const ticket = ticketRes.json.data.ticket;

    const wsConnected = await new Promise((resolve) => {
      const ws = new WebSocket(`${wsUrl}/ws?ticket=${encodeURIComponent(ticket)}`);
      ws.on('message', (raw) => {
        const msg = JSON.parse(raw.toString());
        if (msg.type === 'connected') {
          ws.close();
          resolve(msg.userId);
        }
      });
    });
    assert.equal(wsConnected, userId);

    // Replaying same ticket fails with 4002
    const replayCode = await new Promise((resolve) => {
      const ws = new WebSocket(`${wsUrl}/ws?ticket=${encodeURIComponent(ticket)}`);
      ws.on('close', (code) => resolve(code));
    });
    assert.equal(replayCode, 4002);

    // Password reset via mocked WhatsApp delivery -> 503 when unconfigured, succeeds when mocked
    const resetNoChannel = await req('POST', '/auth/password-reset/request', { identifier: 'lifecycle@akwaba.ci' });
    assert.equal(resetNoChannel.status, 503);

    const origFetch = globalThis.fetch;
    const origWaSim = config.whatsapp.useLocalSimulator;
    const origWaTok = config.whatsapp.accessToken;
    const origWaId = config.whatsapp.phoneNumberId;
    let capturedResetCode = '';
    try {
      config.whatsapp.useLocalSimulator = false;
      config.whatsapp.accessToken = 'EAAB_prod_test_tok';
      config.whatsapp.phoneNumberId = '123456789';
      globalThis.fetch = async (url, opts) => {
        if (String(url).includes('graph.facebook.com')) {
          const parsed = JSON.parse(opts.body);
          capturedResetCode = parsed.template.components[0].parameters[0].text;
          return new Response(JSON.stringify({ messages: [{ id: 'wamid.reset' }] }), { status: 200 });
        }
        return origFetch(url, opts);
      };

      const reqReset = await req('POST', '/auth/password-reset/request', { identifier: 'lifecycle@akwaba.ci' });
      assert.equal(reqReset.status, 200);
      assert.equal(reqReset.json.data.devResetCode, undefined);
      assert.match(capturedResetCode, /^\d{6}$/);

      const confirmReset = await req('POST', '/auth/password-reset/confirm', {
        identifier: 'lifecycle@akwaba.ci',
        code: capturedResetCode,
        newPassword: 'NewProdPassword225!',
      });
      assert.equal(confirmReset.status, 200);

      const loginNew = await req('POST', '/auth/login', {
        email: 'lifecycle@akwaba.ci',
        password: 'NewProdPassword225!',
      });
      assert.equal(loginNew.status, 200);
      token = loginNew.json.data.token;
    } finally {
      globalThis.fetch = origFetch;
      config.whatsapp.useLocalSimulator = origWaSim;
      config.whatsapp.accessToken = origWaTok;
      config.whatsapp.phoneNumberId = origWaId;
    }

    // Change password from Profile
    const chPwd = await req(
      'POST',
      '/auth/change-password',
      { currentPassword: 'NewProdPassword225!', newPassword: 'FinalPassword225!' },
      token
    );
    assert.equal(chPwd.status, 200);

    // Hot SQLite backup with integrity_check
    const backup = createHotBackup(db, path.join(config.dataDir, 'backups'), 3);
    assert.equal(backup.integrity, 'ok');
    assert.equal(fs.existsSync(backup.backupPath), true);

    // Admin brute-force rate limit & admin reports/ban
    const reporter = await req('POST', '/auth/register', {
      email: 'reporter@akwaba.ci',
      password: 'Password225!',
      name: 'Moussa',
      age: 30,
      phone: '+2250708990001',
      acceptedTerms: true,
    });
    const repCall = await req(
      'POST',
      '/safety/report',
      { targetId: userId, reason: 'Profil suspect test' },
      reporter.json.data.token
    );
    assert.equal(repCall.status, 200);

    const adminHeaders = { 'X-Admin-Secret': config.adminModerationSecret };
    const reportsRes = await req('GET', '/safety/admin/reports', null, null, adminHeaders);
    assert.equal(reportsRes.status, 200);
    assert.ok(reportsRes.json.data.reports.some((r) => r.targetId === userId));

    // Delete account cleanly removes DB user + avatar + private selfie files on disk
    const badDel = await req('DELETE', '/auth/me', { password: 'WrongPassword' }, token);
    assert.equal(badDel.status, 401);

    const delRes = await req('DELETE', '/auth/me', { password: 'FinalPassword225!' }, token);
    assert.equal(delRes.status, 200);
    assert.equal(delRes.json.data.deleted, true);
    assert.ok(delRes.json.data.removedFiles >= 2);
    assert.equal(fs.existsSync(avatarFile), false);
    assert.equal(fs.existsSync(selfieFile), false);

    // Admin brute-force protection: 5 failed attempts -> 6th returns 429
    for (let i = 0; i < 5; i += 1) {
      const failAdm = await req('GET', '/safety/admin/verifications', null, null, {
        'X-Admin-Secret': `bad_secret_${i}`,
        'X-Forwarded-For': '196.170.77.77',
      });
      assert.equal(failAdm.status, 401);
    }
    const lockedAdm = await req('GET', '/safety/admin/verifications', null, null, {
      'X-Admin-Secret': 'bad_secret_6',
      'X-Forwarded-For': '196.170.77.77',
    });
    assert.equal(lockedAdm.status, 429);
  });
});
