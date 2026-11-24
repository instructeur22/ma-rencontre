import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const nodeEnv = process.env.NODE_ENV || 'development';
const useLocalSimulator =
  process.env.GENIUSPAY_LOCAL_SIMULATOR === 'true' ||
  !process.env.GENIUSPAY_PUBLIC_KEY ||
  !process.env.GENIUSPAY_SECRET_KEY;

if (nodeEnv === 'production') {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    throw new Error('FATAL: JWT_SECRET (>= 32 caractères) est obligatoire en production.');
  }
  if (!useLocalSimulator && !process.env.GENIUSPAY_WEBHOOK_SECRET) {
    throw new Error('FATAL: GENIUSPAY_WEBHOOK_SECRET est obligatoire lorsque GeniusPay est actif en production.');
  }
}

export const config = {
  rootDir: ROOT_DIR,
  port: Number(process.env.PORT || 3000),
  nodeEnv,
  appBaseUrl: process.env.APP_BASE_URL || `http://localhost:${process.env.PORT || 3000}`,
  corsOrigin: process.env.CORS_ORIGIN || '*',
  allowDemoLogin: process.env.ALLOW_DEMO_LOGIN === 'true' || nodeEnv !== 'production',
  jwtSecret: process.env.JWT_SECRET || 'akwaba_dev_secret_change_in_production_225',
  dbPath: path.resolve(ROOT_DIR, process.env.DB_PATH || './data/akwaba.sqlite'),
  geniusPay: {
    env: process.env.GENIUSPAY_ENV || 'sandbox',
    baseUrl: process.env.GENIUSPAY_BASE_URL || 'https://pay.genius.ci/api/v1/merchant',
    publicKey: process.env.GENIUSPAY_PUBLIC_KEY || '',
    secretKey: process.env.GENIUSPAY_SECRET_KEY || '',
    webhookSecret: process.env.GENIUSPAY_WEBHOOK_SECRET || 'whsec_sandbox_akwaba_local_demo',
    useLocalSimulator,
  },
};
