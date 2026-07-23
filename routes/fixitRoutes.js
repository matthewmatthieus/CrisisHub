const express = require('express');
const router = express.Router();

const fixitController = require('../controllers/fixitController');
const { isAuthenticated } = require('../middleware/authMiddleware');

// Public - View all FixIt reports
router.get('/', fixitController.showAllFixits);

// Public - Create form
router.get('/create', fixitController.showCreateForm);

// Public - Submit report
router.post('/create', fixitController.createFixit);

// Public - View report details
router.get('/:id', fixitController.showFixit);

// Public - View image
router.get('/:id/image', fixitController.showFixitImage);

// Logged in only - Edit
router.get('/:id/edit', isAuthenticated, fixitController.showEditForm);

// Logged in only - Update
router.post('/:id/edit', isAuthenticated, fixitController.updateFixit);

// Logged in only - Delete
router.post('/:id/delete', isAuthenticated, fixitController.deleteFixit);

// Public - Volunteer
router.post('/:id/volunteer', fixitController.volunteer);

// Public - Withdraw volunteer
router.post('/:id/withdraw', fixitController.withdrawVolunteer);

module.exports = router;