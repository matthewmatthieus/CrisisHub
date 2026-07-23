const express = require('express');

const adminController = require('../controllers/adminController');

const router = express.Router();

router.get('/', adminController.showDashboard);
router.get('/users', adminController.showUsers);
router.post('/users/:id/role', adminController.updateUserRole);
router.get('/reports', adminController.showReports);
router.get('/categories', adminController.showCategories);
router.post('/categories/rename', adminController.renameCategory);
router.get('/incidents', adminController.showIncidentStatus);
router.post('/incidents/:id/status', adminController.updateIncidentStatus);
router.get('/moderation', adminController.showModeration);
router.post('/moderation/fixit/:id/status', adminController.updateFixitStatus);
router.get('/statistics', adminController.showStatistics);

module.exports = router;