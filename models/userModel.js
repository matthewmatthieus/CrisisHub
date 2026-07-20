const db = require('../config/db');

/**
 * Finds a user by email address.
 */
async function findByEmail(email) {
    const [rows] = await db.execute(
        `SELECT id, username, email, password, role, status,
                reputation_score, profile_picture, created_at, updated_at
         FROM users
         WHERE email = ?
         LIMIT 1`,
        [email]
    );

    return rows[0] || null;
}

/**
 * Finds a user by username.
 */
async function findByUsername(username) {
    const [rows] = await db.execute(
        `SELECT id, username, email, password, role, status,
                reputation_score, profile_picture, created_at, updated_at
         FROM users
         WHERE username = ?
         LIMIT 1`,
        [username]
    );

    return rows[0] || null;
}

/**
 * Finds a user by primary key.
 */
async function findById(userId) {
    const [rows] = await db.execute(
        `SELECT id, username, email, role, status,
                reputation_score, profile_picture, created_at, updated_at
         FROM users
         WHERE id = ?
         LIMIT 1`,
        [userId]
    );

    return rows[0] || null;
}

/**
 * Creates a user account with hashed password.
 */
async function createUser({
    username,
    email,
    passwordHash,
    role = 'user',
    status = 'Active'
}) {
    const [result] = await db.execute(
        `INSERT INTO users
            (username, email, password, role, status, reputation_score)
         VALUES (?, ?, ?, ?, ?, 50)`,
        [username, email, passwordHash, role, status]
    );

    return result.insertId;
}

/**
 * Updates a user's profile picture filename.
 */
async function updateProfilePicture(userId, filename) {
    await db.execute(
        `UPDATE users
         SET profile_picture = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [filename, userId]
    );
}

/**
 * Adjusts reputation score by a delta and returns the new score.
 */
async function updateReputation(userId, delta) {
    await db.execute(
        `UPDATE users
         SET reputation_score = LEAST(100, GREATEST(0, reputation_score + ?)),
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [delta, userId]
    );

    return getReputation(userId);
}

/**
 * Increases user reputation.
 */
async function increaseReputation(userId, amount = 1) {
    return updateReputation(userId, Math.abs(amount));
}

/**
 * Decreases user reputation.
 */
async function decreaseReputation(userId, amount = 1) {
    return updateReputation(userId, -Math.abs(amount));
}

/**
 * Gets the current reputation score.
 */
async function getReputation(userId) {
    const [rows] = await db.execute(
        `SELECT reputation_score
         FROM users
         WHERE id = ?
         LIMIT 1`,
        [userId]
    );

    return rows[0] ? rows[0].reputation_score : null;
}

module.exports = {
    findByEmail,
    findByUsername,
    findById,
    createUser,
    updateProfilePicture,
    increaseReputation,
    decreaseReputation,
    getReputation
};