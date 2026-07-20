const db = require('../config/db');

/**
 * Creates an empty profile record for a newly registered user.
 */
async function createDefaultProfile(userId) {
    await db.execute(
        `INSERT INTO user_profiles (user_id, full_name, phone, address, bio)
         VALUES (?, '', '', '', '')`,
        [userId]
    );
}

/**
 * Gets profile information for a user.
 */
async function getByUserId(userId) {
    const [rows] = await db.execute(
        `SELECT profile_id, user_id, full_name, phone, address, bio, created_at, updated_at
         FROM user_profiles
         WHERE user_id = ?
         LIMIT 1`,
        [userId]
    );

    return rows[0] || null;
}

/**
 * Inserts or updates profile details.
 */
async function upsertByUserId(userId, { full_name, phone, address, bio }) {
    await db.execute(
        `INSERT INTO user_profiles (user_id, full_name, phone, address, bio)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
            full_name = VALUES(full_name),
            phone = VALUES(phone),
            address = VALUES(address),
            bio = VALUES(bio),
            updated_at = CURRENT_TIMESTAMP`,
        [userId, full_name, phone, address, bio]
    );
}

module.exports = {
    createDefaultProfile,
    getByUserId,
    upsertByUserId
};