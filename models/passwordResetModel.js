const db = require('../config/db');

async function createToken({ userId, tokenHash, expiresAt }) {
    await db.execute('INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES (?, ?, ?)', [userId, tokenHash, expiresAt]);
}
async function findValidToken(tokenHash) {
    const [rows] = await db.execute(`SELECT id, user_id, expires_at FROM password_reset_tokens WHERE token_hash = ? AND used_at IS NULL AND expires_at > NOW() LIMIT 1`, [tokenHash]);
    return rows[0] || null;
}
async function markUsed(id) {
    await db.execute('UPDATE password_reset_tokens SET used_at = NOW() WHERE id = ?', [id]);
}

module.exports = { createToken, findValidToken, markUsed };
