const db = require('../config/db');

// Get all incidents
async function getAllIncidents() {
    const [rows] = await db.execute(`
        SELECT
            i.*,
            u.username
        FROM incidents i
        JOIN users u
            ON i.user_id = u.id
        ORDER BY i.created_at DESC
    `);

    return rows;
}

// Get one incident
async function getIncidentById(id) {
    const [rows] = await db.execute(`
        SELECT
            i.*,
            u.username
        FROM incidents i
        JOIN users u
            ON i.user_id = u.id
        WHERE i.id = ?
    `, [id]);

    return rows[0];
}

// Create incident
async function createIncident(incident) {

    const {
        title,
        description,
        category,
        severity,
        location,
        latitude,
        longitude,
        image,
        user_id
    } = incident;

    const [result] = await db.execute(`
        INSERT INTO incidents
        (
            title,
            description,
            category,
            severity,
            location,
            latitude,
            longitude,
            image,
            user_id
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
        title,
        description,
        category,
        severity,
        location,
        latitude,
        longitude,
        image,
        user_id
    ]);

    return result.insertId;
}

// Update incident
async function updateIncident(id, incident) {

    const {
        title,
        description,
        category,
        severity,
        location,
        latitude,
        longitude,
        status
    } = incident;

    await db.execute(`
        UPDATE incidents
        SET
            title = ?,
            description = ?,
            category = ?,
            severity = ?,
            location = ?,
            latitude = ?,
            longitude = ?,
            status = ?
        WHERE id = ?
    `, [
        title,
        description,
        category,
        severity,
        location,
        latitude,
        longitude,
        status,
        id
    ]);
}

// Delete incident
async function deleteIncident(id) {
    await db.execute(
        `DELETE FROM incidents WHERE id = ?`,
        [id]
    );
}

module.exports = {
    getAllIncidents,
    getIncidentById,
    createIncident,
    updateIncident,
    deleteIncident
};