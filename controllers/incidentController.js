const incidentModel = require('../models/incidentModel');

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
            user_id: req.session.user.id
        });

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

        res.render('incidents/details', { incident });
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

        if (!incident) {
            req.session.error = 'Incident not found.';
            return res.redirect('/incidents');
        }

        const uploadedImage = readIncidentImage(req);

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

        req.session.success = 'Incident updated successfully.';
        res.redirect('/incidents');
    } catch (error) {
        console.error(error);
        req.session.error = error.message.includes('incident images')
            ? error.message
            : 'Unable to update incident.';
        res.redirect(`/incidents/${req.params.id}/edit`);
    }
}

async function deleteIncident(req, res) {
    try {
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
