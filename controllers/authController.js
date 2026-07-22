const bcrypt = require('bcrypt');
const { validationResult } = require('express-validator');
const userModel = require('../models/userModel');
const profileModel = require('../models/profileModel');
const activityModel = require('../models/activityModel');

/**
 * Converts express-validator errors into a simple object map.
 */
function mapValidationErrors(validationErrors) {
    return validationErrors.array().reduce((accumulator, current) => {
        if (!accumulator[current.path]) {
            accumulator[current.path] = current.msg;
        }
        return accumulator;
    }, {});
}

/**
 * Maps common database failures to user-friendly auth messages.
 */
function getAuthFailureMessage(error, fallbackMessage) {
    if (!error) {
        return fallbackMessage;
    }

    if (error.code === 'ER_ACCESS_DENIED_ERROR') {
        return 'Database login failed. Please check DB_USER and DB_PASSWORD in your environment settings.';
    }

    if (error.code === 'ER_BAD_DB_ERROR') {
        return 'Database not found. Please check DB_NAME in your environment settings.';
    }

    if ((error.message || '').toLowerCase().includes('self-signed certificate')) {
        return 'Database SSL certificate issue. If you are using local MySQL, set DB_SSL=false.';
    }

    return fallbackMessage;
}

/**
 * Renders registration page.
 */
function showRegister(req, res) {
    return res.render('auth/register', {
        formData: {},
        errors: {}
    });
}

/**
 * Handles account registration and initializes profile/session.
 */
async function register(req, res) {
    const validationErrors = validationResult(req);

    if (!validationErrors.isEmpty()) {
        return res.status(422).render('auth/register', {
            formData: req.body,
            errors: mapValidationErrors(validationErrors)
        });
    }

    const { username, email, password } = req.body;

    try {
        const existingEmail = await userModel.findByEmail(email);
        if (existingEmail) {
            return res.status(409).render('auth/register', {
                formData: req.body,
                errors: { email: 'This email is already registered.' }
            });
        }

        const existingUsername = await userModel.findByUsername(username);
        if (existingUsername) {
            return res.status(409).render('auth/register', {
                formData: req.body,
                errors: { username: 'This username is already taken.' }
            });
        }

        const passwordHash = await bcrypt.hash(password, 12);
        const userId = await userModel.createUser({
            username,
            email,
            passwordHash,
            role: 'user',
            status: 'Active'
        });

        await profileModel.createDefaultProfile(userId);
        await activityModel.logActivity(userId, 'Registered account');

        req.session.user = {
            user_id: userId,
            username,
            role: 'user',
            id: userId,
            name: username
        };

        req.session.success = 'Registration successful. Welcome to CrisisHub.';
        return res.redirect('/');
    } catch (error) {
        console.error(error);
        return res.status(500).render('auth/register', {
            formData: req.body,
            errors: {
                general: getAuthFailureMessage(
                    error,
                    'Unable to complete registration right now.'
                )
            }
        });
    }
}

/**
 * Renders login page.
 */
function showLogin(req, res) {
    return res.render('auth/login', {
        formData: {},
        errors: {}
    });
}

/**
 * Handles login, account status checks, and session creation.
 */
async function login(req, res) {
    const validationErrors = validationResult(req);

    if (!validationErrors.isEmpty()) {
        return res.status(422).render('auth/login', {
            formData: req.body,
            errors: mapValidationErrors(validationErrors)
        });
    }

    const { email, password } = req.body;

    try {
        const user = await userModel.findByEmail(email);

        if (!user) {
            return res.status(401).render('auth/login', {
                formData: req.body,
                errors: { general: 'Invalid email or password.' }
            });
        }

        if (user.status === 'Suspended' || user.status === 'Banned') {
            return res.status(403).render('auth/login', {
                formData: req.body,
                errors: { warning: `Your account is ${user.status}. Please contact support.` }
            });
        }

        const passwordMatch = await bcrypt.compare(password, user.password);
        if (!passwordMatch) {
            return res.status(401).render('auth/login', {
                formData: req.body,
                errors: { general: 'Invalid email or password.' }
            });
        }

        req.session.user = {
            user_id: user.id,
            username: user.username,
            role: user.role,
            id: user.id,
            name: user.username
        };

        await activityModel.logActivity(user.id, 'Logged in');
        req.session.success = 'Login successful.';
        return res.redirect('/');
    } catch (error) {
        console.error(error);
        return res.status(500).render('auth/login', {
            formData: req.body,
            errors: {
                general: getAuthFailureMessage(
                    error,
                    'Unable to login right now.'
                )
            }
        });
    }
}

/**
 * Destroys authenticated session and logs logout activity.
 */
async function logout(req, res) {
    const user = req.session.user;

    try {
        if (user) {
            await activityModel.logActivity(user.user_id, 'Logged out');
        }
    } catch (error) {
        console.error(error);
    }

    req.session.destroy(() => {
        res.redirect('/auth/login');
    });
}

/**
 * Renders authenticated dashboard.
 */
async function showDashboard(req, res) {
    try {
        const user = await userModel.findById(req.session.user.user_id);
        const activity = await activityModel.getByUserId(req.session.user.user_id, 10);

        return res.render('index', {
            user,
            activity
        });
    } catch (error) {
        console.error(error);
        req.session.error = 'Unable to load dashboard.';
        return res.redirect('/auth/login');
    }
}

module.exports = {
    showRegister,
    register,
    showLogin,
    login,
    logout,
    showDashboard
};