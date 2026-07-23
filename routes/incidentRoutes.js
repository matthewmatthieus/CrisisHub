const express = require('express');
const router = express.Router();

const incidentController = require('../controllers/incidentController');
const { isAuthenticated } = require('../middleware/authMiddleware');

// Public
router.get('/', incidentController.showAllIncidents);

// Public
router.get('/create', incidentController.showCreateForm);

// Public
router.post('/create', incidentController.createIncident);

// Public
router.get('/:id', incidentController.showIncident);

// Public
router.get('/:id/image', incidentController.showIncidentImage);

// Logged-in only
router.get('/:id/edit', isAuthenticated, incidentController.showEditForm);

// Logged-in only
router.post('/:id/edit', isAuthenticated, incidentController.updateIncident);

// Logged-in only
router.post('/:id/delete', isAuthenticated, incidentController.deleteIncident);

module.exports = router;