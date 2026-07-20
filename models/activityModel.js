const db = require('../config/db');

/**
 * Writes one user activity record.
 */
async function logActivity(userId, activity) {
    await db.execute(
        `INSERT INTO user_activity (user_id, activity)
         VALUES (?, ?)`,
        [userId, activity]
    );
}

/**
 * Returns latest activity entries for one user.
 */
async function getByUserId(userId, limit = 20) {
    const [rows] = await db.execute(
        `SELECT activity_id, user_id, activity, created_at
         FROM user_activity
         WHERE user_id = ?
         ORDER BY created_at DESC
         LIMIT ?`,
        [userId, Number(limit)]
    );

    return rows;
}

module.exports = {
    logActivity,
    getByUserId
};