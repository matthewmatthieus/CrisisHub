/**
 * Ensures the request has an authenticated session user.
 */
function isAuthenticated(req, res, next) {
    if (!req.session.user) {
        req.session.error = 'Please login to continue.';
        return res.redirect('/auth/login');
    }

    return next();
}

/**
 * Ensures the authenticated user has Admin role.
 */
function isAdmin(req, res, next) {
    if (!req.session.user || req.session.user.role !== 'Admin') {
        req.session.warning = 'Admin access is required for this page.';
        return res.redirect('/');
    }

    return next();
}

/**
 * Ensures the authenticated user has Moderator or Admin role.
 */
function isModerator(req, res, next) {
    if (!req.session.user || !['Moderator', 'Admin'].includes(req.session.user.role)) {
        req.session.warning = 'Moderator access is required for this page.';
        return res.redirect('/');
    }

    return next();
}

module.exports = {
    isAuthenticated,
    isAdmin,
    isModerator
};