import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { createRateLimiter } from './middleware/rateLimit.js';
import authRoutes from './routes/auth.js';
import profilesRoutes from './routes/profiles.js';
import matchingRoutes from './routes/matching.js';
import chatRoutes from './routes/chat.js';
import safetyRoutes from './routes/safety.js';
import paymentsRoutes from './routes/payments.js';
import datesRoutes from './routes/dates.js';

const CSP_HEADER = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: blob: https:",
  "media-src 'self' data: blob:",
  "connect-src 'self' ws: wss:",
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
].join('; ');

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  if (config.trustProxy !== false) {
    app.set('trust proxy', config.trustProxy);
  }

  const allowedOrigins =
    config.corsOrigin === '*'
      ? null
      : config.corsOrigin
          .split(',')
          .map((o) => o.trim())
          .filter(Boolean);

  // Security & CORS headers ready for Web PWA & Flutter clients
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(self), microphone=(self), geolocation=()');
    res.setHeader('Content-Security-Policy', CSP_HEADER);
    if (config.nodeEnv === 'production') {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }

    if (!allowedOrigins) {
      res.setHeader('Access-Control-Allow-Origin', '*');
    } else {
      const reqOrigin = req.headers.origin;
      if (reqOrigin && allowedOrigins.includes(reqOrigin)) {
        res.setHeader('Access-Control-Allow-Origin', reqOrigin);
      }
      res.setHeader('Vary', 'Origin');
    }

    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, X-Admin-Secret');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });

  app.use(
    express.json({
      limit: '6mb',
      verify: (req, _res, buf) => {
        if (req.originalUrl && req.originalUrl.includes('/webhooks/')) {
          req.rawBody = buf.toString('utf8');
        }
      },
    })
  );

  // Brute-force rate limiter for authentication & reset endpoints (proxy-aware via trust proxy)
  const authRateLimiter = createRateLimiter({
    windowMs: 60_000,
    max: 25,
    code: 'RATE_LIMITED',
    message: 'Trop de tentatives. Réessayez dans une minute.',
  });
  app.use('/api/v1/auth', (req, res, next) => {
    const guarded = ['/login', '/register', '/password-reset/request', '/password-reset/confirm', '/phone-otp/request'];
    if (req.method !== 'POST' || !guarded.includes(req.path)) return next();
    return authRateLimiter(req, res, next);
  });

  app.get('/api/v1/public-config', (_req, res) => {
    res.json({
      success: true,
      data: {
        environment: config.nodeEnv,
        demoEnabled: Boolean(config.allowDemoLogin),
        paymentSandboxUi: Boolean(config.nodeEnv !== 'production' && config.geniusPay.useLocalSimulator),
        whatsappConfigured: Boolean(
          !config.whatsapp.useLocalSimulator && config.whatsapp.accessToken && config.whatsapp.phoneNumberId
        ),
        emailResetConfigured: Boolean(config.email?.resendApiKey || config.email?.webhookUrl),
      },
    });
  });

  app.get('/api/v1/health', (req, res) => {
    res.json({
      success: true,
      service: 'akwaba-api',
      version: '1.0.0',
      environment: config.nodeEnv,
      geniusPayMode: config.geniusPay.useLocalSimulator ? 'sandbox-simulator' : config.geniusPay.env,
      whatsappOtpMode: config.whatsapp.useLocalSimulator ? 'local-simulator' : 'meta-cloud-api',
      selfieVisionAi: config.selfieAi.geminiApiKey ? config.selfieAi.geminiModel : 'manual-moderation',
      timestamp: new Date().toISOString(),
    });
  });

  // Versioned API v1 routes (shared by Web App & future Flutter iOS/Android)
  app.use('/api/v1/auth', authRoutes);
  app.use('/api/v1/profiles', profilesRoutes);
  app.use('/api/v1', matchingRoutes);
  app.use('/api/v1/chats', chatRoutes);
  app.use('/api/v1/safety', safetyRoutes);
  app.use('/api/v1', paymentsRoutes);
  app.use('/api/v1/dates', datesRoutes);

  // Serve persistent user uploads from DATA_DIR/uploads before public/ fallback
  fs.mkdirSync(config.uploadsDir, { recursive: true });
  app.use(
    '/uploads',
    express.static(config.uploadsDir, {
      setHeaders: (res) => {
        res.setHeader('X-Content-Type-Options', 'nosniff');
      },
    })
  );

  // Serve isolated Moderation Console & Web App
  const publicDir = path.join(config.rootDir, 'public');
  app.get('/admin', (_req, res) => {
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    res.setHeader('Cache-Control', 'no-store');
    return res.sendFile(path.join(publicDir, 'admin.html'));
  });

  app.use(express.static(publicDir));

  app.get('*', (req, res) => {
    if (req.path.startsWith('/api/')) {
      return res.status(404).json({
        success: false,
        error: { code: 'ENDPOINT_NOT_FOUND', message: `Route introuvable: ${req.path}` },
      });
    }
    return res.sendFile(path.join(publicDir, 'index.html'));
  });

  // Global error handler (malformed JSON or uncaught route errors)
  app.use((err, _req, res, _next) => {
    if (err?.type === 'entity.parse.failed') {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_JSON', message: 'Corps JSON mal formé.' },
      });
    }
    if (err?.type === 'entity.too.large') {
      return res.status(413).json({
        success: false,
        error: { code: 'PAYLOAD_TOO_LARGE', message: 'Fichier ou requête trop volumineuse.' },
      });
    }
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Erreur interne du serveur.' },
    });
  });

  return app;
}
