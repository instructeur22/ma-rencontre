import express from 'express';
import path from 'node:path';
import { config } from './config.js';
import authRoutes from './routes/auth.js';
import profilesRoutes from './routes/profiles.js';
import matchingRoutes from './routes/matching.js';
import chatRoutes from './routes/chat.js';
import safetyRoutes from './routes/safety.js';
import paymentsRoutes from './routes/payments.js';
import datesRoutes from './routes/dates.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');

  const authRateWindowMs = 60_000;
  const authRateMax = 30;
  const authHits = new Map();

  // Security & CORS headers ready for Web PWA & Flutter clients
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Access-Control-Allow-Origin', config.corsOrigin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
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

  // Brute-force rate limiter for authentication endpoints
  app.use('/api/v1/auth', (req, res, next) => {
    if (req.method !== 'POST' || !['/login', '/register'].includes(req.path)) return next();
    const ip = req.ip || req.socket?.remoteAddress || 'unknown';
    const now = Date.now();
    const entry = authHits.get(ip);
    if (!entry || now > entry.resetAt) {
      authHits.set(ip, { count: 1, resetAt: now + authRateWindowMs });
      return next();
    }
    entry.count += 1;
    if (entry.count > authRateMax) {
      return res.status(429).json({
        success: false,
        error: { code: 'RATE_LIMITED', message: 'Trop de tentatives. Réessayez dans une minute.' },
      });
    }
    return next();
  });

  app.get('/api/v1/health', (req, res) => {
    res.json({
      success: true,
      service: 'akwaba-api',
      version: '1.0.0',
      geniusPayMode: config.geniusPay.useLocalSimulator ? 'sandbox-simulator' : config.geniusPay.env,
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

  // Serve Web App & uploaded assets
  const publicDir = path.join(config.rootDir, 'public');
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
