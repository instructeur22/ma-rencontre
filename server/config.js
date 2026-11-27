import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const explicitPort = process.env.PORT;
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const nodeEnv = process.env.NODE_ENV || 'development';
const port = Number(process.env.PORT || 3000);
let appBaseUrl = process.env.APP_BASE_URL || `http://localhost:${port}`;
if (nodeEnv !== 'production' && explicitPort && /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(appBaseUrl)) {
  appBaseUrl = `http://localhost:${port}`;
}
const useLocalSimulator =
  process.env.GENIUSPAY_LOCAL_SIMULATOR === 'true' ||
  !process.env.GENIUSPAY_PUBLIC_KEY ||
  !process.env.GENIUSPAY_SECRET_KEY;

const whatsappUseLocalSimulator =
  process.env.WHATSAPP_LOCAL_SIMULATOR === 'true' ||
  !process.env.WHATSAPP_ACCESS_TOKEN ||
  !process.env.WHATSAPP_PHONE_NUMBER_ID;

if (nodeEnv === 'production') {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    throw new Error('FATAL: JWT_SECRET (>= 32 caractères) est obligatoire en production.');
  }
  if (!useLocalSimulator && !process.env.GENIUSPAY_WEBHOOK_SECRET) {
    throw new Error('FATAL: GENIUSPAY_WEBHOOK_SECRET est obligatoire lorsque GeniusPay est actif en production.');
  }
}

const dataDir = path.resolve(ROOT_DIR, process.env.DATA_DIR || './data');
const dbPath = path.resolve(ROOT_DIR, process.env.DB_PATH || path.join(dataDir, 'akwaba.sqlite'));
const uploadsDir = path.resolve(ROOT_DIR, process.env.UPLOADS_DIR || path.join(dataDir, 'uploads'));

let trustProxy = nodeEnv === 'production' ? 1 : false;
if (process.env.TRUST_PROXY !== undefined && process.env.TRUST_PROXY !== '') {
  if (process.env.TRUST_PROXY === 'true') trustProxy = true;
  else if (process.env.TRUST_PROXY === 'false') trustProxy = false;
  else if (/^\d+$/.test(process.env.TRUST_PROXY)) trustProxy = Number(process.env.TRUST_PROXY);
  else trustProxy = process.env.TRUST_PROXY;
}

export const config = {
  rootDir: ROOT_DIR,
  dataDir,
  uploadsDir,
  port,
  nodeEnv,
  appBaseUrl,
  trustProxy,
  corsOrigin: process.env.CORS_ORIGIN || (nodeEnv === 'production' ? appBaseUrl : '*'),
  allowDemoLogin: process.env.ALLOW_DEMO_LOGIN === 'true' || nodeEnv !== 'production',
  jwtSecret: process.env.JWT_SECRET || 'akwaba_dev_secret_change_in_production_225',
  adminModerationSecret:
    process.env.ADMIN_MODERATION_SECRET || (nodeEnv !== 'production' ? 'akwaba_dev_mod_225' : ''),
  dbPath,
  email: {
    resendApiKey: process.env.RESEND_API_KEY || '',
    fromAddress: process.env.EMAIL_FROM || 'AKWABA <no-reply@akwaba.ci>',
    webhookUrl: process.env.EMAIL_WEBHOOK_URL || '',
  },
  geniusPay: {
    env: process.env.GENIUSPAY_ENV || 'sandbox',
    baseUrl: process.env.GENIUSPAY_BASE_URL || 'https://pay.genius.ci/api/v1/merchant',
    publicKey: process.env.GENIUSPAY_PUBLIC_KEY || '',
    secretKey: process.env.GENIUSPAY_SECRET_KEY || '',
    webhookSecret: process.env.GENIUSPAY_WEBHOOK_SECRET || 'whsec_sandbox_akwaba_local_demo',
    useLocalSimulator,
  },
  whatsapp: {
    apiVersion: process.env.WHATSAPP_API_VERSION || 'v21.0',
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || '',
    accessToken: process.env.WHATSAPP_ACCESS_TOKEN || '',
    otpTemplateName: process.env.WHATSAPP_OTP_TEMPLATE || 'akwaba_otp_auth',
    otpTemplateLang: process.env.WHATSAPP_OTP_LANG || 'fr',
    cooldownSec: Number(process.env.WHATSAPP_OTP_COOLDOWN_SEC || 45),
    ttlSec: Number(process.env.WHATSAPP_OTP_TTL_SEC || 300),
    useLocalSimulator: whatsappUseLocalSimulator,
  },
  selfieAi: {
    geminiApiKey: process.env.GEMINI_API_KEY || '',
    geminiModel: process.env.GEMINI_VISION_MODEL || 'gemini-4-hydrogen',
    baseUrl: process.env.GEMINI_API_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta',
  },
};
