import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { getDb } from '../db/database.js';

export function signAuthToken(userId) {
  return jwt.sign({ sub: userId }, config.jwtSecret, { expiresIn: '30d' });
}

export function verifyAuthToken(token) {
  return jwt.verify(token, config.jwtSecret);
}

export async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
  if (!token) {
    return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Jeton d’authentification manquant.' } });
  }

  try {
    const decoded = verifyAuthToken(token);
    const db = getDb();
    const user = await db.get('SELECT * FROM users WHERE id = ?', decoded.sub);
    if (!user) {
      return res.status(401).json({ success: false, error: { code: 'USER_NOT_FOUND', message: 'Compte introuvable.' } });
    }
    req.user = { ...user };
    await db.run('UPDATE users SET last_active_at = ?, online_status = 1 WHERE id = ?', new Date().toISOString(), user.id);
    return next();
  } catch {
    return res.status(401).json({ success: false, error: { code: 'INVALID_TOKEN', message: 'Session expirée ou invalide.' } });
  }
}
