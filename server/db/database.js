import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { config } from '../config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let dbInstance = null;

export function getDb(customPath = null) {
  if (dbInstance && !customPath) return dbInstance;
  const targetPath = customPath || config.dbPath;
  if (targetPath !== ':memory:') {
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  }
  const db = new DatabaseSync(targetPath);
  db.exec('PRAGMA busy_timeout = 5000;');
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf-8');
  db.exec(schema);
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
