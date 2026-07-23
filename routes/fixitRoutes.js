const express = require('express');
const router = express.Router();

const fixitController = require('../controllers/fixitController');
const { isAuthenticated } = require('../middleware/authMiddleware');

// Display all FixIt reports
router.get('/', isAuthenticated, fixitController.showAllFixits);

// Display create form
router.get('/create', isAuthenticated, fixitController.showCreateForm);

// Create FixIt report
router.post('/create', isAuthenticated, fixitController.createFixit);

// Display single report
router.get('/:id', isAuthenticated, fixitController.showFixit);

// Display image
router.get('/:id/image', isAuthenticated, fixitController.showFixitImage);

// Display edit form
router.get('/:id/edit', isAuthenticated, fixitController.showEditForm);

// Update report
router.post('/:id/edit', isAuthenticated, fixitController.updateFixit);

// Delete report
router.post('/:id/delete', isAuthenticated, fixitController.deleteFixit);

// Volunteer
router.post('/:id/volunteer', isAuthenticated, fixitController.volunteer);

// Withdraw volunteer
router.post('/:id/withdraw', isAuthenticated, fixitController.withdrawVolunteer);

module.exports = router;