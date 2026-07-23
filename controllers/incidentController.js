const incidentModel = require('../models/incidentModel');
const userModel = require('../models/userModel');
const { sendIncidentStatusEmail } = require('../services/emailService');
const { sendAdminAlertEmail } = require('../services/emailService');

const allowedIncidentImageMimeTypes = new Set([
    'image/png',
    'image/jpeg',
    'image/gif',
    'image/webp'
]);

function getIncidentImageUpload(req) {
    const upload = req.files && req.files.image;
    return upload ? (Array.isArray(upload) ? upload[0] : upload) : null;
}

function readIncidentImage(req) {
    const upload = getIncidentImageUpload(req);

    if (!upload || !upload.name) {
        return null;
    }

    if (!allowedIncidentImageMimeTypes.has(upload.mimetype)) {
        throw new Error('Only PNG, JPG, JPEG, GIF and WEBP incident images are allowed.');
    }

    return {
        data: upload.data,
        mimeType: upload.mimetype
    };
}

async function showAllIncidents(req, res) {
    try {
        const incidents = await incidentModel.getAllIncidents();
        res.render('incidents/index', { incidents });
    } catch (error) {
        console.error(error);
        req.session.error = 'Unable to load incidents.';
        res.redirect('/');
    }
}

function showCreateForm(req, res) {
    res.render('incidents/create');
}

async function createIncident(req, res) {
    try {
        const { title, description, category, severity, location } = req.body;
        const uploadedImage = readIncidentImage(req);

        await incidentModel.createIncident({
            title,
            description,
            category,
            severity,
            location,
            latitude: null,
            longitude: null,
            image: null,
            image_data: uploadedImage ? uploadedImage.data : null,
            image_mime_type: uploadedImage ? uploadedImage.mimeType : null,
            user_id: req.session.user ? req.session.user.id : null
        });

        if (['High', 'Critical'].includes(severity)) {
            userModel.getAdminEmails()
                .then((adminEmails) => adminEmails.length
                    ? sendAdminAlertEmail({ adminEmails, alertType: 'high_priority_incident' })
                    : null)
                .catch((emailError) => console.error('Unable to send incident admin alert:', emailError.message));
        }

        req.session.success = 'Incident reported successfully.';
        res.redirect('/incidents');
    } catch (error) {
        console.error(error);
        req.session.error = error.message.includes('incident images')
            ? error.message
            : 'Unable to report incident.';
        res.redirect('/incidents/create');
    }
}

async function showIncident(req, res) {
    try {
        const incident = await incidentModel.getIncidentById(req.params.id);

        if (!incident) {
            req.session.error = 'Incident not found.';
            return res.redirect('/incidents');
        }

        const isOwner =
            req.session.user &&
            Number(req.session.user.id) === Number(incident.user_id);

        const isAdmin =
            req.session.user &&
            String(req.session.user.role).toLowerCase() === 'admin';

        res.render('incidents/details', {
            incident,
            isOwner,
            isAdmin
        });

    } catch (error) {
        console.error(error);
        req.session.error = 'Unable to load incident.';
        res.redirect('/incidents');
    }
}

async function showIncidentImage(req, res) {
    try {
        const image = await incidentModel.getIncidentImage(req.params.id);

        if (!image || !image.image_data) {
            return res.sendStatus(404);
        }

        res.type(image.image_mime_type || 'application/octet-stream');
        res.set('Cache-Control', 'private, max-age=300');
        return res.send(image.image_data);
    } catch (error) {
        console.error(error);
        return res.sendStatus(500);
    }
}

async function showEditForm(req, res) {
    try {

        const incident = await incidentModel.getIncidentById(req.params.id);

        if (!incident) {
            req.session.error = 'Incident not found.';
            return res.redirect('/incidents');
        }

        const isOwner =
            Number(req.session.user.id) === Number(incident.user_id);

        const isAdmin =
            String(req.session.user.role).toLowerCase() === 'admin';

        if (!isOwner && !isAdmin) {
            req.session.error = 'You are not allowed to edit this incident.';
            return res.redirect(`/incidents/${incident.id}`);
        }

        res.render('incidents/edit', { incident });

    } catch (error) {
        console.error(error);
        req.session.error = 'Unable to load incident.';
        res.redirect('/incidents');
    }
}

async function updateIncident(req, res) {
    try {
        const { title, description, category, severity, location, status } = req.body;
        const incident = await incidentModel.getIncidentById(req.params.id);

        const isOwner =
        Number(req.session.user.id) === Number(incident.user_id);
        // Check if the user is an admin (Delete if error)
        const isAdmin =
            String(req.session.user.role).toLowerCase() === 'admin';

        if (!isOwner && !isAdmin) {
            req.session.error = 'You are not allowed to edit this incident.';
            return res.redirect(`/incidents/${incident.id}`);
        }

        if (!incident) {
            req.session.error = 'Incident not found.';
            return res.redirect('/incidents');
        }

        const uploadedImage = readIncidentImage(req);

        if (incident.image && !incident.image_data && !uploadedImage) {
            throw new Error('This legacy incident image is unavailable. Please choose a replacement image.');
        }

        await incidentModel.updateIncident(req.params.id, {
            title,
            description,
            category,
            severity,
            location,
            latitude: null,
            longitude: null,
            image: uploadedImage ? null : incident.image || null,
            image_data: uploadedImage ? uploadedImage.data : incident.image_data || null,
            image_mime_type: uploadedImage
                ? uploadedImage.mimeType
                : incident.image_mime_type || null,
            status
        });

        if (incident.email && incident.status !== status) {
            const notificationStatus = {
                Active: 'under_review',
                Verified: 'verified',
                Resolved: 'resolved',
                Closed: 'resolved'
            }[status];

            if (notificationStatus) {
                sendIncidentStatusEmail({
                    email: incident.email,
                    name: incident.username,
                    incidentId: incident.id,
                    status: notificationStatus
                }).catch((emailError) => console.error('Unable to send incident status email:', emailError.message));
            }
        }

        req.session.success = 'Incident updated successfully.';
        res.redirect('/incidents');
    } catch (error) {
        console.error(error);
        req.session.error = error.message.includes('incident images')
            || error.message.includes('legacy incident image')
            ? error.message
            : 'Unable to update incident.';
        res.redirect(`/incidents/${req.params.id}/edit`);
    }
}

async function deleteIncident(req, res) {
    try {

        const incident = await incidentModel.getIncidentById(req.params.id);

        if (!incident) {
            req.session.error = 'Incident not found.';
            return res.redirect('/incidents');
        }

        const isAdmin =
            String(req.session.user.role).toLowerCase() === 'admin';

        if (!isAdmin) {
            req.session.error = 'Only administrators can delete incidents.';
            return res.redirect(`/incidents/${incident.id}`);
        }

        await incidentModel.deleteIncident(req.params.id);

        req.session.success = 'Incident deleted successfully.';
        res.redirect('/incidents');

    } catch (error) {
        console.error(error);
        req.session.error = 'Unable to delete incident.';
        res.redirect('/incidents');
    }
}

module.exports = {
    showAllIncidents,
    showCreateForm,
    createIncident,
    showIncident,
    showIncidentImage,
    showEditForm,
    updateIncident,
    deleteIncident
};
