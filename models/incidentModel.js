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
        image_data,
        image_mime_type,
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
            image_data,
            image_mime_type,
            user_id
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
        title,
        description,
        category,
        severity,
        location,
        latitude,
        longitude,
        image,
        image_data,
        image_mime_type,
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
        image,
        image_data,
        image_mime_type,
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
            image = ?,
            image_data = ?,
            image_mime_type = ?,
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
        image,
        image_data,
        image_mime_type,
        status,
        id
    ]);
}

async function getIncidentImage(id) {
    const [rows] = await db.execute(
        `SELECT image_data, image_mime_type FROM incidents WHERE id = ?`,
        [id]
    );

    return rows[0];
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
    deleteIncident,
    getIncidentImage
};
