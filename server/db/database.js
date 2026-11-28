import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { config } from '../config.js';

const { Pool } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let dbInstance = null;

/**
 * Convert SQLite `?` placeholders outside single-quoted string literals to PostgreSQL `$1, $2, ...`
 */
export function toPgSql(sql) {
  let out = '';
  let paramIdx = 0;
  let inSingleQuote = false;
  for (let i = 0; i < sql.length; i += 1) {
    const ch = sql[i];
    if (ch === "'") {
      if (inSingleQuote && sql[i + 1] === "'") {
        out += "''";
        i += 1;
        continue;
      }
      inSingleQuote = !inSingleQuote;
      out += ch;
    } else if (ch === '?' && !inSingleQuote) {
      paramIdx += 1;
      out += `$${paramIdx}`;
    } else {
      out += ch;
    }
  }
  return out;
}

function normalizeSqlParams(params) {
  if (params.length === 1 && Array.isArray(params[0])) return params[0];
  return params;
}

function ensureSqliteMigrations(sqliteRaw) {
  const userCols = new Set(
    sqliteRaw.prepare('PRAGMA table_info(users)').all().map((c) => c.name)
  );
  if (!userCols.has('terms_accepted_at')) {
    sqliteRaw.exec("ALTER TABLE users ADD COLUMN terms_accepted_at TEXT DEFAULT '';");
  }

  const verifCols = new Set(
    sqliteRaw.prepare('PRAGMA table_info(safety_verifications)').all().map((c) => c.name)
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
      sqliteRaw.exec(`ALTER TABLE safety_verifications ADD COLUMN ${col} ${def};`);
    }
  }
}

export class SqliteDb {
  constructor(targetPath = config.dbPath) {
    if (targetPath !== ':memory:') {
      fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    }
    this.isPostgres = false;
    this.raw = new DatabaseSync(targetPath);
    this.raw.exec('PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON;');
    if (targetPath !== ':memory:') {
      try {
        this.raw.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;');
      } catch {
        this.raw.exec('PRAGMA journal_mode = DELETE; PRAGMA synchronous = NORMAL;');
      }
    }
    this._txDepth = 0;
  }

  async initSchema() {
    const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf-8');
    this.raw.exec(schema);
    ensureSqliteMigrations(this.raw);
  }

  async get(sql, ...params) {
    const args = normalizeSqlParams(params);
    const row = this.raw.prepare(sql).get(...args);
    return row ? { ...row } : null;
  }

  async all(sql, ...params) {
    const args = normalizeSqlParams(params);
    return this.raw.prepare(sql).all(...args).map((r) => ({ ...r }));
  }

  async run(sql, ...params) {
    const args = normalizeSqlParams(params);
    const res = this.raw.prepare(sql).run(...args);
    return { changes: Number(res?.changes || 0), lastInsertRowid: res?.lastInsertRowid };
  }

  async exec(sql) {
    this.raw.exec(sql);
  }

  async close() {
    this.raw.close();
  }
}

function createPgQueryInterface(executor) {
  return {
    isPostgres: true,
    async get(sql, ...params) {
      const args = normalizeSqlParams(params);
      const res = await executor.query(toPgSql(sql), args);
      return res.rows[0] ? { ...res.rows[0] } : null;
    },
    async all(sql, ...params) {
      const args = normalizeSqlParams(params);
      const res = await executor.query(toPgSql(sql), args);
      return res.rows.map((r) => ({ ...r }));
    },
    async run(sql, ...params) {
      const args = normalizeSqlParams(params);
      const res = await executor.query(toPgSql(sql), args);
      return { changes: Number(res.rowCount || 0) };
    },
    async exec(sql) {
      await executor.query(sql);
    },
  };
}

export class PostgresDb {
  constructor(connectionString) {
    this.isPostgres = true;
    const isLocal = /localhost|127\.0\.0\.1/.test(connectionString);
    this.pool = new Pool({
      connectionString,
      ssl: isLocal ? false : { rejectUnauthorized: false },
      max: 10,
      idleTimeoutMillis: 30_000,
    });
    const base = createPgQueryInterface(this.pool);
    this.get = base.get;
    this.all = base.all;
    this.run = base.run;
    this.exec = base.exec;
  }

  async initSchema() {
    const schema = fs.readFileSync(path.join(__dirname, 'schema.pg.sql'), 'utf-8');
    await this.pool.query(schema);
  }

  async close() {
    await this.pool.end();
  }
}

export async function initDb() {
  if (dbInstance) return dbInstance;
  const targetDb = config.databaseUrl ? new PostgresDb(config.databaseUrl) : new SqliteDb(config.dbPath);
  await targetDb.initSchema();
  dbInstance = targetDb;
  return dbInstance;
}

export function getDb() {
  if (!dbInstance) {
    throw new Error('Base de données non initialisée : appelez initDb() au démarrage.');
  }
  return dbInstance;
}

export function setDbForTests(testDb) {
  dbInstance = testDb;
}

export async function closeDb() {
  if (dbInstance) {
    await dbInstance.close();
    dbInstance = null;
  }
}

export async function runInTransaction(db, asyncFn) {
  if (db.isPostgres) {
    if (db._isTxClient) {
      return asyncFn(db);
    }
    const client = await db.pool.connect();
    const txDb = { ...createPgQueryInterface(client), _isTxClient: true };
    try {
      await client.query('BEGIN');
      const result = await asyncFn(txDb);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // Ignore rollback error
      }
      throw err;
    } finally {
      client.release();
    }
  }

  if (db._txDepth > 0) {
    return asyncFn(db);
  }
  db.raw.exec('BEGIN IMMEDIATE');
  db._txDepth += 1;
  try {
    const result = await asyncFn(db);
    db.raw.exec('COMMIT');
    return result;
  } catch (err) {
    try {
      db.raw.exec('ROLLBACK');
    } catch {
      // Ignore rollback error if transaction already closed
    }
    throw err;
  } finally {
    db._txDepth -= 1;
  }
}

export function normalizeRow(row) {
  if (!row) return null;
  return { ...row };
}

export function normalizeRows(rows) {
  return (rows || []).map((r) => ({ ...r }));
}
