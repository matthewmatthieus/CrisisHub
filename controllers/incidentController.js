const incidentModel = require('../models/incidentModel');

/**
 * Display all incidents
 */
async function showAllIncidents(req, res) {
    try {
        const incidents = await incidentModel.getAllIncidents();

        res.render('incidents/index', {
            incidents
        });
    } catch (err) {
        console.error(err);
        req.session.error = 'Unable to load incidents.';
        res.redirect('/');
    }
}

/**
 * Display create incident form
 */
function showCreateForm(req, res) {
    res.render('incidents/create');
}

/**
 * Create a new incident
 */
async function createIncident(req, res) {
    try {
        const {
            title,
            description,
            category,
            severity,
            location,
            latitude,
            longitude,
            status
        } = req.body;

        await incidentModel.createIncident({
            title,
            description,
            category,
            severity,
            location,
            latitude,
            longitude,
            status,
            image: req.file ? req.file.filename : null,
            user_id: req.session.user.user_id
        });

        req.session.success = 'Incident reported successfully.';
        res.redirect('/incidents');

    } catch (err) {
        console.error(err);
        req.session.error = 'Unable to create incident.';
        res.redirect('/incidents/create');
    }
}

/**
 * Display a single incident
 */
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

    } catch (err) {
        console.error(err);
        req.session.error = 'Unable to load incident.';
        res.redirect('/incidents');
    }
}

/**
 * Display edit form
 */
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

    } catch (err) {
        console.error(err);
        req.session.error = 'Unable to load incident.';
        res.redirect('/incidents');
    }
}

/**
 * Update incident
 */
async function updateIncident(req, res) {
    try {
        const {
            title,
            description,
            category,
            severity,
            location,
            latitude,
            longitude,
            status
        } = req.body;

        await incidentModel.updateIncident(req.params.id, {
            title,
            description,
            category,
            severity,
            location,
            latitude,
            longitude,
            status,
            image: req.file ? req.file.filename : null
        });

        req.session.success = 'Incident updated successfully.';
        res.redirect(`/incidents/${req.params.id}`);

    } catch (err) {
        console.error(err);
        req.session.error = 'Unable to update incident.';
        res.redirect(`/incidents/${req.params.id}/edit`);
    }
}

/**
 * Delete incident
 */
async function deleteIncident(req, res) {
    try {
        await incidentModel.deleteIncident(req.params.id);

        req.session.success = 'Incident deleted successfully.';
        res.redirect('/incidents');

    } catch (err) {
        console.error(err);
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