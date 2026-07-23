const bcrypt = require('bcrypt');
const { validationResult } = require('express-validator');
const db = require('../config/db');
const userModel = require('../models/userModel');
const profileModel = require('../models/profileModel');
const activityModel = require('../models/activityModel');
const passwordResetModel = require('../models/passwordResetModel');
const { createSecureToken, hashToken } = require('../services/tokenService');
const {
    sendVerificationEmail,
    sendWelcomeEmail,
    sendProductBriefEmail,
    sendPasswordResetEmail
} = require('../services/emailService');

function appUrl(pathname = '') {
    return `${(process.env.APP_URL || 'http://localhost:3000').replace(/\/+$/, '')}/${String(pathname).replace(/^\/+/, '')}`;
}

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

    const { username, password } = req.body;
    const email = req.body.email.trim().toLowerCase();

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

        const { token, tokenHash } = createSecureToken();
        const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
        await userModel.updateVerificationToken(userId, tokenHash, expiresAt);
        await sendVerificationEmail({
            email,
            name: username,
            verificationUrl: appUrl(`/auth/verify-email/${token}`)
        });

        return res.render('auth/verify-pending', {
            email,
            success: 'Registration successful. Check your email to verify your account.',
            error: null
        });
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

        if (!user.email_verified) {
            return res.status(403).render('auth/verify-pending', {
                email: user.email,
                success: null,
                error: 'Verify your email before logging in.'
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

function showForgotPassword(req, res) {
    return res.render('auth/forgot-password', { success: null, error: null });
}

async function requestPasswordReset(req, res) {
    const genericMessage = 'If an account exists for that email, a reset link has been sent.';
    try {
        const email = String(req.body.email || '').trim().toLowerCase();
        const user = email ? await userModel.findByEmail(email) : null;

        if (user) {
            const { token, tokenHash } = createSecureToken();
            await passwordResetModel.createToken({
                userId: user.id,
                tokenHash,
                expiresAt: new Date(Date.now() + 30 * 60 * 1000)
            });
            await sendPasswordResetEmail({
                email: user.email,
                name: user.username,
                resetUrl: appUrl(`/auth/reset-password/${token}`)
            });
        }
    } catch (error) {
        console.error(error);
        return res.status(503).render('auth/forgot-password', {
            success: null,
            error: 'We could not send the reset email right now. Please try again later.'
        });
    }

    return res.render('auth/forgot-password', { success: genericMessage, error: null });
}

async function verifyEmail(req, res) {
    try {
        const user = await userModel.findByVerificationToken(hashToken(req.params.token));
        if (!user) {
            return res.status(400).render('auth/verification-result', { success: false, message: 'This verification link is invalid.' });
        }
        if (!user.verification_token_expires_at || new Date(user.verification_token_expires_at) < new Date()) {
            return res.status(400).render('auth/verification-result', { success: false, message: 'This verification link has expired.' });
        }

        await userModel.markEmailVerified(user.id);
        try {
            await sendWelcomeEmail({ email: user.email, name: user.username });
            await sendProductBriefEmail({ email: user.email, name: user.username });
        } catch (emailError) {
            console.error(emailError);
        }
        return res.render('auth/verification-result', { success: true, message: 'Your email has been verified. You can now log in.' });
    } catch (error) {
        console.error(error);
        return res.status(500).render('auth/verification-result', { success: false, message: 'Verification failed.' });
    }
}

function showResetPassword(req, res) {
    return res.render('auth/reset-password', { token: req.params.token, error: null });
}

async function resetPassword(req, res) {
    try {
        const resetRecord = await passwordResetModel.findValidToken(hashToken(req.params.token));
        if (!resetRecord) {
            return res.status(400).render('auth/reset-result', { success: false, message: 'The reset link is invalid or expired.' });
        }

        const { password, confirmPassword } = req.body;
        if (!password || password.length < 8 || !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password) || !/[^A-Za-z0-9]/.test(password)) {
            return res.status(400).render('auth/reset-password', { token: req.params.token, error: 'Password must be at least 8 characters with uppercase, lowercase, number and special character.' });
        }
        if (password !== confirmPassword) {
            return res.status(400).render('auth/reset-password', { token: req.params.token, error: 'Passwords do not match.' });
        }

        await userModel.updatePassword(resetRecord.user_id, await bcrypt.hash(password, 12));
        await passwordResetModel.markUsed(resetRecord.id);
        return res.render('auth/reset-result', { success: true, message: 'Your password has been reset. You can now log in.' });
    } catch (error) {
        console.error(error);
        return res.status(500).render('auth/reset-result', { success: false, message: 'Password reset failed.' });
    }
}

async function resendVerification(req, res) {
    const genericMessage = 'If the account is unverified, a new verification email has been sent.';
    try {
        const email = String(req.body.email || '').trim().toLowerCase();
        const user = email ? await userModel.findByEmail(email) : null;
        if (!user || user.email_verified) return res.render('auth/verify-pending', { email, success: genericMessage, error: null });

        if (user.verification_email_sent_at && Date.now() - new Date(user.verification_email_sent_at).getTime() < 60000) {
            return res.status(429).render('auth/verify-pending', { email, success: null, error: 'Please wait before requesting another email.' });
        }

        const { token, tokenHash } = createSecureToken();
        await userModel.updateVerificationToken(user.id, tokenHash, new Date(Date.now() + 60 * 60 * 1000));
        await sendVerificationEmail({ email: user.email, name: user.username, verificationUrl: appUrl(`/auth/verify-email/${token}`) });
    } catch (error) {
        console.error(error);
        return res.status(500).render('auth/verify-pending', { email: req.body.email, success: null, error: 'Unable to resend the email.' });
    }
    return res.render('auth/verify-pending', { email: req.body.email, success: genericMessage, error: null });
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
        const activity = await activityModel.getByUserId(
            req.session.user.user_id,
            10
        );

        // Dashboard statistics
        const [[active]] = await db.execute(
            "SELECT COUNT(*) AS total FROM incidents WHERE status != 'Resolved'"
        );

        const [[critical]] = await db.execute(
            "SELECT COUNT(*) AS total FROM incidents WHERE severity = 'Critical'"
        );
        const [[pending]] = await db.execute(`
            SELECT COUNT(*) AS total
            FROM incidents i
            LEFT JOIN incident_votes iv
                ON i.id = iv.incident_id
                AND iv.vote_type = 'confirm'
            WHERE iv.vote_id IS NULL
              AND i.status = 'Active'
        `);
        const [[resolved]] = await db.execute(
            "SELECT COUNT(*) AS total FROM incidents WHERE status = 'Resolved'"
        );
        // Latest incidents + verification statistics
        const [incidents] = await db.execute(`
            SELECT
                i.*,
                u.username AS owner_name,

                COUNT(CASE WHEN iv.vote_type = 'confirm' THEN 1 END) AS confirmCount,

                COUNT(CASE WHEN iv.vote_type = 'dispute' THEN 1 END) AS disputeCount,

                COALESCE(
                    ROUND(
                        COUNT(CASE WHEN iv.vote_type = 'confirm' THEN 1 END)
                        * 100.0 /
                        NULLIF(COUNT(iv.vote_id), 0)
                    ),
                    0
                ) AS confidence,

                CASE
                    WHEN COUNT(CASE WHEN iv.vote_type='confirm' THEN 1 END) >= 3
                    THEN 'Verified'
                    ELSE i.status
                END AS displayStatus

            FROM incidents i

            LEFT JOIN (
                SELECT
                    incident_id,
                    COUNT(CASE WHEN vote_type='confirm' THEN 1 END) AS confirms
                FROM incident_votes
                GROUP BY incident_id
            ) v
            ON v.incident_id = i.id

            LEFT JOIN users u
                ON i.user_id = u.id

            LEFT JOIN incident_votes iv
                ON i.id = iv.incident_id

            WHERE COALESCE(v.confirms,0) < 3

            GROUP BY i.id

            ORDER BY i.created_at DESC
        `);

        return res.render('index', {
            user,
            activity,
            incidents,
            stats: {
                activeIncidents: active.total,
                criticalIncidents: critical.total,
                pendingVerification: pending.total,
                resolvedIncidents: resolved.total
            }
        });

    } catch (error) {

        console.error(error);

        req.session.error = "Unable to load dashboard.";

        return res.redirect("/auth/login");

    }
}

module.exports = {
    showRegister,
    register,
    showLogin,
    login,
    logout,
    showDashboard
    ,showForgotPassword,
    requestPasswordReset,
    verifyEmail,
    showResetPassword,
    resetPassword,
    resendVerification
};
