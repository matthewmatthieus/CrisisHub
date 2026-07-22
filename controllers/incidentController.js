const path = require('path');
const fs = require('fs/promises');
const incidentModel = require('../models/incidentModel');

const incidentUploadDir = path.join(__dirname, '..', 'public', 'uploads', 'incidents');
const allowedIncidentImageExtensions = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp']);
const allowedIncidentImageMimeTypes = new Set([
    'image/png',
    'image/jpeg',
    'image/gif',
    'image/webp'
]);

function getIncidentImageUpload(req) {
    const upload = req.files && req.files.image;

    if (!upload) {
        return null;
    }

    return Array.isArray(upload) ? upload[0] : upload;
}

async function saveIncidentImage(req) {
    const upload = getIncidentImageUpload(req);

    if (!upload || !upload.name) {
        return null;
    }

    const extension = path.extname(upload.name).toLowerCase();

    if (!allowedIncidentImageExtensions.has(extension)
        || !allowedIncidentImageMimeTypes.has(upload.mimetype)) {
        throw new Error('Only PNG, JPG, JPEG, GIF and WEBP incident images are allowed.');
    }

    await fs.mkdir(incidentUploadDir, { recursive: true });

    const safeBaseName = path.basename(upload.name, extension)
        .replace(/[^a-zA-Z0-9_-]/g, '_')
        .slice(0, 60) || 'incident';
    const filename = `${Date.now()}_${safeBaseName}${extension}`;

    await upload.mv(path.join(incidentUploadDir, filename));
    return filename;
}

async function removeIncidentImage(filename) {
    if (!filename) {
        return;
    }

    try {
        await fs.unlink(path.join(incidentUploadDir, filename));
    } catch (error) {
        if (error.code !== 'ENOENT') {
            console.error('Unable to remove incident image:', error.message);
        }
    }
}

// Display all incidents
async function showAllIncidents(req, res) {
    try {
        const incidents = await incidentModel.getAllIncidents();

        res.render('incidents/index', {
            incidents
        });

    } catch (error) {
        console.error(error);
        req.session.error = 'Unable to load incidents.';
        res.redirect('/');
    }
}

// Display create form
function showCreateForm(req, res) {
    res.render('incidents/create');
}

// Create incident
async function createIncident(req, res) {
    let image = null;

    try {

        const {
            title,
            description,
            category,
            severity,
            location
        } = req.body;

        image = await saveIncidentImage(req);

        await incidentModel.createIncident({
            title,
            description,
            category,
            severity,
            location,
            latitude: null,
            longitude: null,
            image,
            user_id: req.session.user.id
        });

        req.session.success = 'Incident reported successfully.';
        res.redirect('/incidents');

    } catch (error) {
        console.error(error);
        await removeIncidentImage(image);
        req.session.error = error.message.includes('incident images')
            ? error.message
            : 'Unable to report incident.';
        res.redirect('/incidents/create');
    }
}

// Display single incident
async function showIncident(req, res) {
    try {

        const incident = await incidentModel.getIncidentById(req.params.id);

        if (!incident) {
            req.session.error = 'Incident not found.';
            return res.redirect('/incidents');
        }

        res.render('incidents/details', {
            incident
        });

    } catch (error) {
        console.error(error);
        req.session.error = 'Unable to load incident.';
        res.redirect('/incidents');
    }
}

// Display edit form
async function showEditForm(req, res) {
    try {

        const incident = await incidentModel.getIncidentById(req.params.id);

        if (!incident) {
            req.session.error = 'Incident not found.';
            return res.redirect('/incidents');
        }

        res.render('incidents/edit', {
            incident
        });

    } catch (error) {
        console.error(error);
        req.session.error = 'Unable to load incident.';
        res.redirect('/incidents');
    }
}

// Update incident
async function updateIncident(req, res) {
    let image = null;

    try {

        const {
            title,
            description,
            category,
            severity,
            location,
            status
        } = req.body;

        const incident = await incidentModel.getIncidentById(req.params.id);

        if (!incident) {
            req.session.error = 'Incident not found.';
            return res.redirect('/incidents');
        }

        image = await saveIncidentImage(req);
        const nextImage = image || incident.image || null;

        await incidentModel.updateIncident(req.params.id, {
            title,
            description,
            category,
            severity,
            location,
            latitude: null,
            longitude: null,
            image: nextImage,
            status
        });

        if (image && incident.image) {
            await removeIncidentImage(incident.image);
        }

        req.session.success = 'Incident updated successfully.';
        res.redirect('/incidents');

    } catch (error) {
        console.error(error);
        await removeIncidentImage(image);
        req.session.error = error.message.includes('incident images')
            ? error.message
            : 'Unable to update incident.';
        res.redirect(`/incidents/${req.params.id}/edit`);
    }
}

// Delete incident
async function deleteIncident(req, res) {
    try {
        const incident = await incidentModel.getIncidentById(req.params.id);

        await incidentModel.deleteIncident(req.params.id);

        if (incident) {
            await removeIncidentImage(incident.image);
        }

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
    showEditForm,
    updateIncident,
    deleteIncident
};
