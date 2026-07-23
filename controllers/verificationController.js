const db = require("../config/db");
const verificationService = require("../services/verificationService");

// ==========================
// Verification Dashboard
// ==========================
exports.index = async (req, res) => {
    try {
        const [incidents] = await db.execute(`
            SELECT
                i.id AS incident_id,
                i.title,
                i.severity,

                COUNT(CASE WHEN v.vote_type='confirm' THEN 1 END) AS confirmCount,
                COUNT(CASE WHEN v.vote_type='dispute' THEN 1 END) AS disputeCount

            FROM incidents i

            LEFT JOIN incident_votes v
                ON i.id = v.incident_id

            GROUP BY i.id

            ORDER BY i.created_at DESC
        `);

        const results = incidents.map((incident) => {

            const confidence = verificationService.calculateConfidence(
                Number(incident.confirmCount),
                Number(incident.disputeCount)
            );

            const priorityScore = verificationService.calculatePriority(
                incident.severity,
                confidence
            );

            const priorityLevel = verificationService.getPriorityLevel(
                priorityScore
            );

            return {
                ...incident,
                confidence,
                priorityScore,
                priorityLevel
            };
        });

        res.render("verification/index", {
            incidents: results
        });

    } catch (err) {
        console.error(err);
        res.status(500).send("Server Error");
    }
};

// ==========================
// Confirm Incident
// ==========================
exports.confirmIncident = async (req, res) => {
    try {

        const incidentId = req.params.id;
        const userId = req.session.user.id;

        await db.execute(
            `
            INSERT INTO incident_votes
            (incident_id, user_id, vote_type)
            VALUES (?, ?, 'confirm')
            ON DUPLICATE KEY UPDATE
            vote_type='confirm'
            `,
            [incidentId, userId]
        );

        req.session.success = "Incident confirmed.";
        res.redirect("/");

    } catch (err) {

        console.error(err);

        req.session.error = "Unable to confirm incident.";

        res.redirect("/");

    }
};

// ==========================
// Dispute Incident
// ==========================
exports.disputeIncident = async (req, res) => {
    try {

        const incidentId = req.params.id;
        const userId = req.session.user.id;

        await db.execute(
            `
            INSERT INTO incident_votes
            (incident_id, user_id, vote_type)
            VALUES (?, ?, 'dispute')
            ON DUPLICATE KEY UPDATE
            vote_type='dispute'
            `,
            [incidentId, userId]
        );

        req.session.success = "Incident disputed.";
        res.redirect("/");

    } catch (err) {

        console.error(err);

        req.session.error = "Unable to dispute incident.";

        res.redirect("/");

    }
};