const express = require('express');
const router = express.Router();
const helpRequestController = require('../controllers/helpRequestController');

console.log('Exported controller functions:', helpRequestController);

// 1. List All & Form Views
router.get('/', helpRequestController.getAllHelpRequests);
router.get('/new', helpRequestController.renderNewForm);

// 2. Create Request
router.post('/', helpRequestController.createHelpRequest);

// 3. Show Request Details & Edit Form
router.get('/:id', helpRequestController.getHelpRequestById);
router.get('/:id/edit', helpRequestController.renderEditForm);

// 4. Update Routes (Supports RESTful PUT, direct POST, and legacy /update)
router.put('/:id', helpRequestController.updateHelpRequest);
router.post('/:id', helpRequestController.updateHelpRequest);
router.post('/:id/update', helpRequestController.updateHelpRequest);

// 5. Delete Routes (Supports RESTful DELETE and legacy /delete)
router.delete('/:id', helpRequestController.deleteHelpRequest);
router.post('/:id/delete', helpRequestController.deleteHelpRequest);

module.exports = router;