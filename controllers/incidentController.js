const incidentModel = require('../models/incidentModel');

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
    try {

        const {
            title,
            description,
            category,
            severity,
            location
        } = req.body;

        let image = null;

        // We'll improve image upload later
        if (req.files && req.files.image) {
            image = req.files.image.name;
        }

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
        req.session.error = 'Unable to report incident.';
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
    try {

        const {
            title,
            description,
            category,
            severity,
            location,
            status
        } = req.body;

        await incidentModel.updateIncident(req.params.id, {
            title,
            description,
            category,
            severity,
            location,
            latitude: null,
            longitude: null,
            status
        });

        req.session.success = 'Incident updated successfully.';
        res.redirect('/incidents');

    } catch (error) {
        console.error(error);
        req.session.error = 'Unable to update incident.';
        res.redirect(`/incidents/${req.params.id}/edit`);
    }
}

// Delete incident
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
    showEditForm,
    updateIncident,
    deleteIncident
};