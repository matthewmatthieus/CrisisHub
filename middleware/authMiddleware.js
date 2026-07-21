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
    const role = req.session.user && String(req.session.user.role).toLowerCase();
    if (!req.session.user || role !== 'admin') {
        req.session.warning = 'Admin access is required for this page.';
        return res.redirect('/');
    }

    return next();
}

/**
 * Ensures the authenticated user has Moderator or Admin role.
 */
function isModerator(req, res, next) {
    const role = req.session.user && String(req.session.user.role).toLowerCase();
    if (!req.session.user || !['moderator', 'admin'].includes(role)) {
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