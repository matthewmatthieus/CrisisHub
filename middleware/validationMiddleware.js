const { body } = require('express-validator');

const registrationValidation = [
    body('username')
        .trim()
        .notEmpty()
        .withMessage('Username is required.'),
    body('email')
        .trim()
        .notEmpty()
        .withMessage('Email is required.')
        .isEmail()
        .withMessage('Please enter a valid email address.'),
    body('password')
        .notEmpty()
        .withMessage('Password is required.')
        .isLength({ min: 8 })
        .withMessage('Password must be at least 8 characters long.')
        .matches(/[A-Z]/)
        .withMessage('Password must include at least one uppercase letter.')
        .matches(/[a-z]/)
        .withMessage('Password must include at least one lowercase letter.')
        .matches(/[0-9]/)
        .withMessage('Password must include at least one number.')
        .matches(/[^A-Za-z0-9]/)
        .withMessage('Password must include at least one special character.'),
    body('confirmPassword')
        .notEmpty()
        .withMessage('Confirm Password is required.')
        .custom((value, { req }) => value === req.body.password)
        .withMessage('Confirm Password must match Password.')
];

const loginValidation = [
    body('email')
        .trim()
        .notEmpty()
        .withMessage('Email is required.')
        .isEmail()
        .withMessage('Please enter a valid email address.'),
    body('password')
        .notEmpty()
        .withMessage('Password is required.')
];

const profileValidation = [
    body('full_name')
        .trim()
        .isLength({ max: 120 })
        .withMessage('Full name must be 120 characters or fewer.'),
    body('phone')
        .trim()
        .isLength({ max: 30 })
        .withMessage('Phone must be 30 characters or fewer.'),
    body('address')
        .trim()
        .isLength({ max: 255 })
        .withMessage('Address must be 255 characters or fewer.'),
    body('bio')
        .trim()
        .isLength({ max: 1000 })
        .withMessage('Bio must be 1000 characters or fewer.')
];

module.exports = {
    registrationValidation,
    loginValidation,
    profileValidation
};