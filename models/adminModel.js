const db = require('../config/db');

const ALLOWED_CATEGORY_TABLES = new Set([
    'incidents',
    'help_requests',
    'resource_offers'
]);

async function tableExists(tableName) {
    const [rows] = await db.execute(
        `SELECT TABLE_NAME
         FROM INFORMATION_SCHEMA.TABLES
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = ?`,
        [tableName]
    );
    return rows.length > 0;
}

async function getTableColumns(tableName) {
    const [rows] = await db.execute(`SHOW COLUMNS FROM \`${tableName}\``);
    return rows.map((row) => row.Field);
}

function pickColumn(columns, candidates) {
    return candidates.find((candidate) => columns.includes(candidate)) || null;
}

async function getUsersPageData() {
    const columns = await getTableColumns('users');
    const idColumn = pickColumn(columns, ['id', 'user_id']);
    const nameColumn = pickColumn(columns, ['name', 'username', 'full_name']);
    const roleColumn = pickColumn(columns, ['role']);
    const statusColumn = pickColumn(columns, ['status']);

    const selectFields = [
        `u.\`${idColumn}\` AS id`,
        nameColumn ? `u.\`${nameColumn}\` AS display_name` : `'Unknown' AS display_name`,
        'u.email',
        roleColumn ? `u.\`${roleColumn}\` AS role` : `'user' AS role`,
        statusColumn ? `u.\`${statusColumn}\` AS status` : `'Active' AS status`,
        'u.created_at'
    ].join(',\n            ');

    const [users] = await db.execute(
        `SELECT ${selectFields}
         FROM users u
         ORDER BY u.created_at DESC, id DESC`
    );

    const [roleRows] = await db.execute(
        'SELECT DISTINCT role AS value FROM users ORDER BY role'
    );

    return {
        users,
        roleOptions: roleRows.map((row) => row.value),
        hasStatusColumn: Boolean(statusColumn)
    };
}

async function getDashboardData() {
    const [totalUsers] = await db.execute('SELECT COUNT(*) AS count FROM users');
    const [activeHelpRequests] = await db.execute(
        `SELECT COUNT(*) AS count
         FROM help_requests
         WHERE status IN ('Open', 'Matched')`
    );
    const [resourceOffers] = await db.execute('SELECT COUNT(*) AS count FROM resource_offers');
    const [criticalIncidents] = await db.execute(
        `SELECT COUNT(*) AS count
         FROM incidents
         WHERE severity = 'Critical'`
    );
    const [pendingReports] = await db.execute(
        `SELECT COUNT(*) AS count
         FROM incidents
         WHERE status = 'Reported'`
    );
    const [resolvedReports] = await db.execute(
        `SELECT COUNT(*) AS count
         FROM incidents
         WHERE status = 'Resolved'`
    );
    const [verifiedReports] = await db.execute(
        `SELECT COUNT(*) AS count
         FROM incidents
         WHERE status = 'Verified'`
    );

    const [incidentCategories] = await db.execute(
        `SELECT category, COUNT(*) AS total
         FROM incidents
         GROUP BY category
         ORDER BY total DESC, category ASC
         LIMIT 6`
    );

    const [resourceCategories] = await db.execute(
        `SELECT category, COUNT(*) AS total
         FROM help_requests
         GROUP BY category
         ORDER BY total DESC, category ASC
         LIMIT 6`
    );

    const [resolutionRate] = await db.execute(
        `SELECT DATE_FORMAT(created_at, '%Y-%m') AS month,
                COUNT(*) AS total_reports,
                SUM(CASE WHEN status = 'Resolved' THEN 1 ELSE 0 END) AS resolved_reports,
                ROUND(
                    CASE WHEN COUNT(*) = 0
                        THEN 0
                        ELSE SUM(CASE WHEN status = 'Resolved' THEN 1 ELSE 0 END) / COUNT(*) * 100
                    END,
                    1
                ) AS resolution_rate
         FROM incidents
         GROUP BY DATE_FORMAT(created_at, '%Y-%m')
         ORDER BY month ASC
         LIMIT 12`
    );

    const monthlySources = [
        `SELECT DATE_FORMAT(created_at, '%Y-%m') AS month, COUNT(*) AS total FROM incidents GROUP BY month`,
        `SELECT DATE_FORMAT(created_at, '%Y-%m') AS month, COUNT(*) AS total FROM help_requests GROUP BY month`,
        `SELECT DATE_FORMAT(created_at, '%Y-%m') AS month, COUNT(*) AS total FROM resource_offers GROUP BY month`
    ];

    const [monthlyReports] = await db.execute(
        `SELECT month, SUM(total) AS total
         FROM (${monthlySources.join(' UNION ALL ')}) AS monthly_feed
         GROUP BY month
         ORDER BY month ASC
         LIMIT 12`
    );

    const activitySources = [
        `SELECT 'Incident' AS activity_type,
                title AS headline,
                status AS detail,
                created_at
         FROM incidents`,
        `SELECT 'Help Request' AS activity_type,
                title AS headline,
                status AS detail,
                created_at
         FROM help_requests`,
        `SELECT 'Resource Offer' AS activity_type,
                item_name AS headline,
                status AS detail,
                created_at
         FROM resource_offers`
    ];

    const [recentActivities] = await db.execute(
        `SELECT activity_type, headline, detail, created_at
         FROM (${activitySources.join(' UNION ALL ')}) AS activity_feed
         ORDER BY created_at DESC
         LIMIT 10`
    );

    return {
        summary: {
            totalUsers: totalUsers[0].count,
            activeHelpRequests: activeHelpRequests[0].count,
            resourceOffers: resourceOffers[0].count,
            criticalIncidents: criticalIncidents[0].count,
            pendingReports: pendingReports[0].count,
            resolvedReports: resolvedReports[0].count,
            verifiedReports: verifiedReports[0].count
        },
        charts: {
            incidentCategories,
            resourceCategories,
            resolutionRate,
            monthlyReports
        },
        recentActivities
    };
}

async function getReportData() {
    const [incidents] = await db.execute(
        `SELECT id, title, category, severity, status, location, created_at
         FROM incidents
         ORDER BY created_at DESC
         LIMIT 12`
    );

    const [helpRequests] = await db.execute(
        `SELECT id, title, category, urgency, status, location, quantity_needed, created_at
         FROM help_requests
         ORDER BY created_at DESC
         LIMIT 12`
    );

    const [resourceOffers] = await db.execute(
        `SELECT id, item_name, category, quantity, status, location, created_at
         FROM resource_offers
         ORDER BY created_at DESC
         LIMIT 12`
    );

    return {
        incidents,
        helpRequests,
        resourceOffers
    };
}

async function getCategoryData() {
    const [incidentCategories] = await db.execute(
        `SELECT category, COUNT(*) AS total, 'incidents' AS source_table
         FROM incidents
         GROUP BY category`
    );

    const [helpRequestCategories] = await db.execute(
        `SELECT category, COUNT(*) AS total, 'help_requests' AS source_table
         FROM help_requests
         GROUP BY category`
    );

    const [resourceOfferCategories] = await db.execute(
        `SELECT category, COUNT(*) AS total, 'resource_offers' AS source_table
         FROM resource_offers
         GROUP BY category`
    );

    const summaryMap = new Map();

    for (const row of [...incidentCategories, ...helpRequestCategories, ...resourceOfferCategories]) {
        if (!summaryMap.has(row.category)) {
            summaryMap.set(row.category, {
                category: row.category,
                total: 0,
                sourceBreakdown: []
            });
        }

        const entry = summaryMap.get(row.category);
        entry.total += Number(row.total);
        entry.sourceBreakdown.push({
            sourceTable: row.source_table,
            total: Number(row.total)
        });
    }

    const categorySummary = Array.from(summaryMap.values())
        .sort((left, right) => right.total - left.total || left.category.localeCompare(right.category));

    const categoriesBySource = {
        incidents: incidentCategories,
        helpRequests: helpRequestCategories,
        resourceOffers: resourceOfferCategories
    };

    return {
        categorySummary,
        categoriesBySource
    };
}

async function getIncidentData() {
    const [incidents] = await db.execute(
        `SELECT id, title, category, severity, status, location, created_at
         FROM incidents
         ORDER BY created_at DESC`
    );

    const [statusOptions] = await db.execute(
        `SELECT DISTINCT status AS value
         FROM incidents
         ORDER BY status`
    );

    return {
        incidents,
        statusOptions: statusOptions.map((row) => row.value)
    };
}

async function getModerationData() {

    const [reports] = await db.execute(`
        SELECT
            f.*,
            u.username,

            0 AS helpers

        FROM fixit_reports f

        LEFT JOIN users u
            ON u.id = f.user_id

        ORDER BY
            FIELD(f.status,'Open','In Progress','Resolved'),
            f.created_at DESC
    `);

    const [[open]] = await db.execute(`
        SELECT COUNT(*) AS total
        FROM fixit_reports
        WHERE status='Open'
    `);

    const [[progress]] = await db.execute(`
        SELECT COUNT(*) AS total
        FROM fixit_reports
        WHERE status='In Progress'
    `);

    const [[resolved]] = await db.execute(`
        SELECT COUNT(*) AS total
        FROM fixit_reports
        WHERE status='Resolved'
    `);

    return {

        reports,

        stats: {

            pending: open.total,
            inProgress: progress.total,
            completed: resolved.total

        }

    };

}

async function getStatisticsData() {
    return getDashboardData();
}

async function updateUserRole(userId, role) {
    await db.execute(
        'UPDATE users SET role = ? WHERE id = ?',
        [role, userId]
    );
}

async function renameCategory(tableName, oldCategory, newCategory) {
    if (!ALLOWED_CATEGORY_TABLES.has(tableName)) {
        throw new Error('Unsupported category table.');
    }

    await db.execute(
        `UPDATE \`${tableName}\`
         SET category = ?
         WHERE category = ?`,
        [newCategory, oldCategory]
    );
}

async function updateIncidentStatus(incidentId, status) {
    await db.execute(
        'UPDATE incidents SET status = ? WHERE id = ?',
        [status, incidentId]
    );
}

module.exports = {
    getDashboardData,
    getUsersPageData,
    getReportData,
    getCategoryData,
    getIncidentData,
    getModerationData,
    getStatisticsData,
    updateUserRole,
    renameCategory,
    updateIncidentStatus
};