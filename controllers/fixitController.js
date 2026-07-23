const db = require("../config/db");

// ==========================
// Show all reports
// ==========================
exports.showAllFixits = async (req, res) => {
    try {

        const [reports] = await db.execute(`
            SELECT
                f.*,
                COALESCE(u.username, 'Guest') AS username,
                COUNT(fv.id) AS volunteerCount,

                MAX(
                    CASE 
                        WHEN fv.user_id = ? THEN 1
                        ELSE 0
                    END
                ) AS userVolunteered

            FROM fixit_reports f

            LEFT JOIN users u
                ON f.user_id = u.id

            LEFT JOIN fixit_volunteers fv
                ON fv.fixit_id = f.id

            GROUP BY f.id

            ORDER BY f.created_at DESC
        `, [
            req.session.user ? req.session.user.user_id : 0
        ]);

        res.render("fixit/index", {
            reports,
            user: req.session.user
        });

    } catch (err) {
        console.error(err);
        res.status(500).send("Server Error");
    }
};

// ==========================
// Create Form
// ==========================
exports.showCreateForm = (req, res) => {

    res.render("fixit/create");

};

// ==========================
// Create Report
// ==========================
exports.createFixit = async (req, res) => {

    try {

        const {
            title,
            description,
            category,
            severity,
            location
        } = req.body;

        let imageData = null;
        let imageMime = null;

        if (req.files && req.files.image) {
            imageData = req.files.image.data;
            imageMime = req.files.image.mimetype;
        }

        await db.execute(  
            `
            INSERT INTO fixit_reports
            (
                title,
                description,
                category,
                severity,
                location,
                image_data,
                image_mime_type,
                user_id
            )
            VALUES
            (?,?,?,?,?,?,?,?)
            `,
            [
                title,
                description,
                category,
                severity,
                location,
                imageData,
                imageMime,
                req.session.user ? req.session.user.id : null
            ]
        );

        res.redirect("/fixit");

    } catch (err) {

        console.error(err);
        res.status(500).send("Server Error");

    }

};

// ==========================
// Show Single Report
// ==========================
exports.showFixit = async (req, res) => {

    try {

        const [rows] = await db.execute(
            `
            SELECT
                f.*,
                COALESCE(u.username, 'Guest') AS username
            FROM fixit_reports f
            LEFT JOIN users u
            ON f.user_id = u.id
            WHERE f.id = ?
            `,
            [req.params.id]
        );

        if (!rows.length)
            return res.redirect("/fixit");

        res.render("fixit/details", {
            report: rows[0],
            user: req.session.user
        });

    } catch (err) {

        console.error(err);
        res.status(500).send("Server Error");

    }

};

// ==========================
// Show Image
// ==========================
exports.showFixitImage = async (req, res) => {

    try {

        const [rows] = await db.execute(
            `
            SELECT image_data,image_mime_type
            FROM fixit_reports
            WHERE id=?
            `,
            [req.params.id]
        );

        if (!rows.length || !rows[0].image_data)
            return res.sendStatus(404);

        res.set("Content-Type", rows[0].image_mime_type);
        res.send(rows[0].image_data);

    } catch (err) {

        console.error(err);
        res.sendStatus(500);

    }

};

// ==========================
// Edit Form
// ==========================
exports.showEditForm = async (req, res) => {

    try {

        const [rows] = await db.execute(
            `
            SELECT *
            FROM fixit_reports
            WHERE id=?
            `,
            [req.params.id]
        );

        if (!rows.length)
            return res.redirect("/fixit");

        res.render("fixit/edit", {
            report: rows[0]
        });

    } catch (err) {

        console.error(err);
        res.status(500).send("Server Error");

    }

};

// ==========================
// Update Report
// ==========================
exports.updateFixit = async (req, res) => {

    try {

        const {
            title,
            description,
            category,
            severity,
            location,
            status
        } = req.body;

        await db.execute(
            `
            UPDATE fixit_reports
            SET
                title=?,
                description=?,
                category=?,
                severity=?,
                location=?,
                status=?
            WHERE id=?
            `,
            [
                title,
                description,
                category,
                severity,
                location,
                status,
                req.params.id
            ]
        );

        res.redirect(`/fixit/${req.params.id}`);

    } catch (err) {

        console.error(err);
        res.status(500).send("Server Error");

    }

};

// ==========================
// Delete Report
// ==========================
exports.deleteFixit = async (req, res) => {

    try {

        await db.execute(
            `
            DELETE FROM fixit_reports
            WHERE id=?
            `,
            [req.params.id]
        );

        res.redirect("/fixit");

    } catch (err) {

        console.error(err);
        res.status(500).send("Server Error");

    }

};

// ==========================
// Volunteer
// ==========================
exports.volunteer = async (req, res) => {

    try {

        const fixitId = req.params.id;

        const userId = req.session.user
            ? req.session.user.user_id
            : null;

        // Check if already volunteered
        let existing = [];

        if (userId) {

            const [rows] = await db.execute(
                `
                SELECT *
                FROM fixit_volunteers
                WHERE fixit_id = ?
                AND user_id = ?
                `,
                [
                    fixitId,
                    userId
                ]
            );

            existing = rows;

        }


        if (existing.length) {

            return res.redirect(`/fixit/${fixitId}`);

        }


        // Add volunteer
        await db.execute(
            `
            INSERT INTO fixit_volunteers
            (
                fixit_id,
                user_id
            )
            VALUES (?,?)
            `,
            [
                fixitId,
                userId
            ]
        );


        // Update status
        await db.execute(
            `
            UPDATE fixit_reports
            SET status = 'In Progress'
            WHERE id = ?
            AND status = 'Open'
            `,
            [
                fixitId
            ]
        );


        res.redirect(`/fixit`);


    } catch (err) {

        console.error(err);
        res.status(500).send("Server Error");

    }

};

// ==========================
// Withdraw Volunteer
// ==========================
exports.withdrawVolunteer = async (req, res) => {

    try {

        await db.execute(
            `
            DELETE FROM fixit_volunteers
            WHERE fixit_id = ?
            AND user_id = ?
            `,
            [
                req.params.id,
                req.session.user.user_id
            ]
        );


        res.redirect("/fixit");


    } catch (err) {

        console.error(err);
        res.status(500).send("Server Error");

    }

};