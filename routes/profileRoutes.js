const express = require('express');
const profileController = require('../controllers/profileController');
const { isAuthenticated } = require('../middleware/authMiddleware');
const { profileValidation } = require('../middleware/validationMiddleware');

const router = express.Router();

router.get('/', isAuthenticated, profileController.showProfile);
router.get('/edit', isAuthenticated, profileController.showEditProfile);
router.post('/edit', isAuthenticated, profileValidation, profileController.updateProfile);

module.exports = router;