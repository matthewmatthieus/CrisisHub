const express = require('express');
const authController = require('../controllers/authController');
const { isAuthenticated } = require('../middleware/authMiddleware');
const {
    registrationValidation,
    loginValidation
} = require('../middleware/validationMiddleware');

const router = express.Router();

router.get('/register', authController.showRegister);
router.post('/register', registrationValidation, authController.register);
router.get('/login', authController.showLogin);
router.post('/login', loginValidation, authController.login);
router.get('/verify-email/:token', authController.verifyEmail);
router.post('/resend-verification', authController.resendVerification);
router.get('/forgot-password', authController.showForgotPassword);
router.post('/forgot-password', authController.requestPasswordReset);
router.get('/reset-password/:token', authController.showResetPassword);
router.post('/reset-password/:token', authController.resetPassword);
router.get('/logout', isAuthenticated, authController.logout);
router.post('/logout', isAuthenticated, authController.logout);

module.exports = router;
