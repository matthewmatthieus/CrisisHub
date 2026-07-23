const adminModel = require('../models/adminModel');

function renderError(res, error, redirectPath, message) {
    console.error(error);
    if (message) {
        res.status(500).send(message);
        return;
    }

    res.redirect(redirectPath);
}

exports.showDashboard = async (req, res) => {
    try {
        const data = await adminModel.getDashboardData();

        res.render('admin/dashboard', {
            pageTitle: 'Admin Dashboard',
            ...data
        });
    } catch (error) {
        renderError(res, error, '/admin', 'Unable to load the admin dashboard.');
    }
};

exports.showUsers = async (req, res) => {
    try {
        const data = await adminModel.getUsersPageData();

        res.render('admin/users', {
            pageTitle: 'Manage Users',
            ...data
        });
    } catch (error) {
        renderError(res, error, '/admin', 'Unable to load the user management page.');
    }
};

exports.updateUserRole = async (req, res) => {
    try {
        const { role } = req.body;

        await adminModel.updateUserRole(req.params.id, role);
        req.session.success = 'User role updated.';
        res.redirect('/admin/users');
    } catch (error) {
        renderError(res, error, '/admin/users');
    }
};

exports.showReports = async (req, res) => {
    try {
        const data = await adminModel.getReportData();

        res.render('admin/reports', {
            pageTitle: 'Manage Reports',
            ...data
        });
    } catch (error) {
        renderError(res, error, '/admin', 'Unable to load the reports page.');
    }
};

exports.showCategories = async (req, res) => {
    try {
        const data = await adminModel.getCategoryData();

        res.render('admin/categories', {
            pageTitle: 'Manage Categories',
            ...data,
            sourceTableOptions: [
                { value: 'incidents', label: 'Incidents' },
                { value: 'help_requests', label: 'Help Requests' },
                { value: 'resource_offers', label: 'Resource Offers' }
            ]
        });
    } catch (error) {
        renderError(res, error, '/admin', 'Unable to load the categories page.');
    }
};

exports.renameCategory = async (req, res) => {
    try {
        const { tableName, oldCategory, newCategory } = req.body;

        await adminModel.renameCategory(tableName, oldCategory, newCategory);
        req.session.success = 'Category updated successfully.';
        res.redirect('/admin/categories');
    } catch (error) {
        renderError(res, error, '/admin/categories');
    }
};

exports.showIncidentStatus = async (req, res) => {
    try {
        const data = await adminModel.getIncidentData();

        res.render('admin/incidents', {
            pageTitle: 'Update Incident Status',
            ...data
        });
    } catch (error) {
        renderError(res, error, '/admin', 'Unable to load the incident status page.');
    }
};

exports.updateIncidentStatus = async (req, res) => {
    try {
        const { status } = req.body;

        await adminModel.updateIncidentStatus(req.params.id, status);
        req.session.success = 'Incident status updated.';
        res.redirect('/admin/incidents');
    } catch (error) {
        renderError(res, error, '/admin/incidents');
    }
};

exports.showModeration = async (req, res) => {
    try {
        const data = await adminModel.getModerationData();

        res.render('admin/moderation', {
            pageTitle: 'Moderate Reports',
            ...data
        });
    } catch (error) {
        renderError(res, error, '/admin', 'Unable to load the moderation page.');
    }
};

exports.showStatistics = async (req, res) => {
    try {
        const data = await adminModel.getStatisticsData();

        res.render('admin/statistics', {
            pageTitle: 'Dashboard Statistics',
            ...data
        });
    } catch (error) {
        renderError(res, error, '/admin', 'Unable to load the statistics page.');
    }
};