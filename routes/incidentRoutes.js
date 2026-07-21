const express = require('express');
const router = express.Router();

const incidentController = require('../controllers/incidentController');
const { isAuthenticated } = require('../middleware/authMiddleware');

// Display all incidents
router.get('/', isAuthenticated, incidentController.showAllIncidents);

// Display create form
router.get('/create', isAuthenticated, incidentController.showCreateForm);

// Create incident
router.post('/create', isAuthenticated, incidentController.createIncident);

// Display single incident
router.get('/:id', isAuthenticated, incidentController.showIncident);

// Display edit form
router.get('/:id/edit', isAuthenticated, incidentController.showEditForm);

// Update incident
router.post('/:id/edit', isAuthenticated, incidentController.updateIncident);

// Delete incident
router.post('/:id/delete', isAuthenticated, incidentController.deleteIncident);

module.exports = router;