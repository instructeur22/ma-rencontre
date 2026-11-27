import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { config } from '../config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let dbInstance = null;

function ensureSchemaMigrations(db) {
  const userCols = new Set(
    db.prepare('PRAGMA table_info(users)').all().map((c) => c.name)
  );
  if (!userCols.has('terms_accepted_at')) {
    db.exec("ALTER TABLE users ADD COLUMN terms_accepted_at TEXT DEFAULT '';");
  }

  const verifCols = new Set(
    db.prepare('PRAGMA table_info(safety_verifications)').all().map((c) => c.name)
  );
  const additions = [
    ['image_path', "TEXT DEFAULT ''"],
    ['ai_provider', "TEXT DEFAULT ''"],
    ['ai_confidence', 'REAL DEFAULT 0'],
    ['ai_reason', "TEXT DEFAULT ''"],
    ['ai_details_json', "TEXT DEFAULT '{}'"],
    ['reviewer_note', "TEXT DEFAULT ''"],
    ['reviewed_at', 'TEXT'],
  ];
  for (const [col, def] of additions) {
    if (!verifCols.has(col)) {
      db.exec(`ALTER TABLE safety_verifications ADD COLUMN ${col} ${def};`);
    }
  }
}

export function getDb(customPath = null) {
  if (dbInstance && !customPath) return dbInstance;
  const targetPath = customPath || config.dbPath;
  if (targetPath !== ':memory:') {
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  }
  const db = new DatabaseSync(targetPath);
  db.exec('PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON;');
  if (targetPath !== ':memory:') {
    try {
      db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;');
    } catch {
      db.exec('PRAGMA journal_mode = DELETE; PRAGMA synchronous = NORMAL;');
    }
  }
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf-8');
  db.exec(schema);
  ensureSchemaMigrations(db);
  if (!customPath) {
    dbInstance = db;
  }
  return db;
}

export function runInTransaction(db, fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    try {
      db.exec('ROLLBACK');
    } catch {
      // Ignore rollback error if transaction already closed
    }
    throw err;
  }
}

export function setDbForTests(testDb) {
  dbInstance = testDb;
}

export function normalizeRow(row) {
  if (!row) return null;
  return { ...row };
}

export function normalizeRows(rows) {
  return rows.map((r) => ({ ...r }));
}
