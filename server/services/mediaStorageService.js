import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';

/**
 * Persist an uploaded public or private media asset in SQL database (survives Render ephemeral disk)
 * and optionally mirror to local disk in SQLite/dev mode for backwards compatibility.
 */
export async function saveMediaFile(db, { mediaPath, userId = null, mimeType, buffer, visibility = 'public' }) {
  const cleanPath = String(mediaPath).trim();
  await db.run(
    `INSERT INTO media_files (path, user_id, mime_type, visibility, data)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (path) DO UPDATE SET
       user_id = COALESCE(EXCLUDED.user_id, media_files.user_id),
       mime_type = EXCLUDED.mime_type,
       visibility = EXCLUDED.visibility,
       data = EXCLUDED.data`,
    cleanPath,
    userId,
    mimeType,
    visibility,
    buffer
  );

  // Also keep disk copy when running locally on SQLite (tests or local dev)
  if (!db.isPostgres) {
    if (visibility === 'public' && cleanPath.startsWith('/uploads/')) {
      const rel = cleanPath.replace(/^\/uploads\//, '');
      const fullPath = path.join(config.uploadsDir, rel);
      fs.mkdirSync(path.dirname(fullPath), { recursive: true });
      fs.writeFileSync(fullPath, buffer);
    } else if (visibility === 'private' && cleanPath.startsWith('private_verifications/')) {
      const filename = path.basename(cleanPath);
      const privDir = path.join(config.dataDir, 'private_verifications');
      fs.mkdirSync(privDir, { recursive: true, mode: 0o700 });
      fs.writeFileSync(path.join(privDir, filename), buffer, { mode: 0o600 });
    }
  }

  return cleanPath;
}

/**
 * Retrieve media buffer + MIME type from SQL media_files (with local filesystem fallback).
 */
export async function getMediaFile(db, mediaPath, visibility = 'public') {
  const cleanPath = String(mediaPath || '').trim();
  if (!cleanPath || cleanPath.includes('..')) return null;

  const row = await db.get(
    'SELECT mime_type, data FROM media_files WHERE path = ? AND visibility = ?',
    cleanPath,
    visibility
  );
  if (row && row.data) {
    return {
      mimeType: row.mime_type,
      buffer: Buffer.isBuffer(row.data) ? row.data : Buffer.from(row.data),
    };
  }

  // Fallback to disk if file existed prior to DB storage
  if (visibility === 'private' && cleanPath.startsWith('private_verifications/')) {
    const filename = path.basename(cleanPath);
    const fullPath = path.join(config.dataDir, 'private_verifications', filename);
    if (fs.existsSync(fullPath)) {
      const ext = path.extname(filename).toLowerCase();
      const mimeType = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
      return { mimeType, buffer: fs.readFileSync(fullPath) };
    }
  }

  return null;
}

export async function deleteUserMediaFiles(db, userId) {
  await db.run('DELETE FROM media_files WHERE user_id = ?', userId);
}
