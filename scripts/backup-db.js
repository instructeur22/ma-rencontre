import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { config } from '../server/config.js';
import { getDb } from '../server/db/database.js';

/**
 * Create a consistent online SQLite backup via VACUUM INTO and verify integrity.
 */
export function createHotBackup(
  db = getDb(),
  backupDir = path.join(config.dataDir, 'backups'),
  keepCount = Number(process.env.BACKUP_KEEP_COUNT || 14)
) {
  fs.mkdirSync(backupDir, { recursive: true, mode: 0o700 });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(backupDir, `akwaba-${stamp}.sqlite`);
  const escaped = backupPath.replace(/'/g, "''");

  db.exec(`VACUUM INTO '${escaped}';`);

  const checkDb = new DatabaseSync(backupPath, { readOnly: true });
  let integrity = 'error';
  try {
    const row = checkDb.prepare('PRAGMA integrity_check;').get();
    integrity = row?.integrity_check || Object.values(row || {})[0] || 'error';
  } finally {
    checkDb.close();
  }

  if (integrity !== 'ok') {
    throw new Error(`Échec vérification d'intégrité backup SQLite : ${integrity}`);
  }

  const stat = fs.statSync(backupPath);

  if (keepCount > 0) {
    const files = fs
      .readdirSync(backupDir)
      .filter((name) => name.startsWith('akwaba-') && name.endsWith('.sqlite'))
      .sort()
      .reverse();
    for (const stale of files.slice(keepCount)) {
      try {
        fs.unlinkSync(path.join(backupDir, stale));
      } catch {
        // Ignore cleanup race
      }
    }
  }

  return {
    backupPath,
    sizeBytes: stat.size,
    integrity,
  };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const result = createHotBackup();
  console.log('AKWABA SQLite hot backup OK:', JSON.stringify(result));
}
