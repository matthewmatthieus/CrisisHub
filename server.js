const express = require('express');
const expressLayouts = require('express-ejs-layouts');
const session = require('express-session');
const methodOverride = require('method-override');
const db = require('./config/db');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.static('public'));
app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use(methodOverride('_method'));
app.use(session({
    secret: process.env.SESSION_SECRET || 'crisishub-dev-secret',
    resave: false,
    saveUninitialized: false
}));

// View Engine
app.set('view engine', 'ejs');
app.use(expressLayouts);
app.set('layout', 'layouts/main');

app.use((req, res, next) => {
    res.locals.currentPath = req.path;
    res.locals.currentUser = req.session.user || null;
    res.locals.success = req.session.success || null;
    res.locals.error = req.session.error || null;
    delete req.session.success;
    delete req.session.error;
    next();
});

app.use(async (req, res, next) => {
    res.locals.sidebarCounts = {
        allReports: 8,
        incidents: 4,
        helpRequests: 2,
        resourceOffers: 0,
        verification: 3
    };

    try {
        const [[resourceCount]] = await db.execute(
            'SELECT COUNT(*) AS count FROM resource_offers'
        );
        res.locals.sidebarCounts.resourceOffers = resourceCount.count;
    } catch (error) {
        console.error('Unable to load sidebar counts:', error.message);
    }

    next();
});

function requireLogin(req, res, next) {
    if (!req.session.user) {
        req.session.error = 'Please use the demo login before managing resource offers.';
        return res.redirect('/');
    }

    next();
}

function calculateMatchScore(offer, request) {
    let score = 0;

    if (offer.category === request.category) {
        score += 40;
    }

    const offerLocation = offer.location.toLowerCase();
    const requestLocation = request.location.toLowerCase();
    if (offerLocation.includes(requestLocation) || requestLocation.includes(offerLocation)) {
        score += 25;
    }

    if (Number(offer.quantity) >= Number(request.quantity_needed)) {
        score += 25;
    } else if (Number(offer.quantity) > 0) {
        score += Math.round((Number(offer.quantity) / Number(request.quantity_needed)) * 15);
    }

    if (request.urgency === 'Critical') {
        score += 10;
    } else if (request.urgency === 'High') {
        score += 6;
    }

    return Math.min(score, 100);
}

async function refreshMatchesForOffer(offerId) {
    const [[offer]] = await db.execute(
        'SELECT * FROM resource_offers WHERE id = ?',
        [offerId]
    );

    if (!offer || offer.status !== 'Available') {
        return;
    }

    const [requests] = await db.execute(
        `SELECT *
         FROM help_requests
         WHERE status IN ('Open', 'Matched')
           AND category = ?`,
        [offer.category]
    );

    for (const request of requests) {
        const score = calculateMatchScore(offer, request);

        if (score >= 50) {
            await db.execute(
                `INSERT INTO matches (resource_offer_id, help_request_id, match_score, status)
                 VALUES (?, ?, ?, 'Pending')
                 ON DUPLICATE KEY UPDATE
                    match_score = VALUES(match_score),
                    status = IF(status IN ('Accepted', 'Rejected'), status, 'Pending')`,
                [offer.id, request.id, score]
            );
        }
    }
}
const verificationRoutes = require('./routes/verification');

app.get('/', (req, res) => {
    res.render('index');
});

app.get('/demo/member3-login', (req, res) => {
    req.session.user = {
        id: 1,
        name: 'Guest',
        role: 'user'
    };
    req.session.success = 'Demo login active for Member 3 resource offer testing.';
    res.redirect('/resourceOffers');
});

app.get('/demo/logout', (req, res) => {
    req.session.destroy(() => {
        res.redirect('/');
    });
});

app.get('/resourceOffers', requireLogin, async (req, res) => {
    try {
        const [offers] = await db.execute(
            `SELECT ro.*,
                    COUNT(m.id) AS match_count,
                    MAX(m.match_score) AS best_match_score
             FROM resource_offers ro
             LEFT JOIN matches m ON ro.id = m.resource_offer_id
             GROUP BY ro.id
             ORDER BY ro.created_at DESC`
        );

        res.render('resourceOffers/index', { offers });
    } catch (error) {
        console.error(error);
        req.session.error = 'Unable to load resource offers.';
        res.redirect('/');
    }
});

app.get('/resourceOffers/new', requireLogin, (req, res) => {
    res.render('resourceOffers/form', {
        offer: null,
        formAction: '/resourceOffers',
        pageTitle: 'Create Resource Offer'
    });
});

app.post('/resourceOffers', requireLogin, async (req, res) => {
    const { category, item_name, quantity, location, notes } = req.body;

    try {
        const [result] = await db.execute(
            `INSERT INTO resource_offers
                (user_id, category, item_name, quantity, location, notes, status)
             VALUES (?, ?, ?, ?, ?, ?, 'Available')`,
            [req.session.user.id, category, item_name, quantity, location, notes || null]
        );

        await refreshMatchesForOffer(result.insertId);

        req.session.success = 'Resource offer created and checked for matching requests.';
        res.redirect(`/resourceOffers/${result.insertId}`);
    } catch (error) {
        console.error(error);
        req.session.error = 'Unable to create resource offer.';
        res.redirect('/resourceOffers/new');
    }
});

app.get('/resourceOffers/:id', requireLogin, async (req, res) => {
    try {
        await refreshMatchesForOffer(req.params.id);

        const [[offer]] = await db.execute(
            'SELECT * FROM resource_offers WHERE id = ?',
            [req.params.id]
        );

        if (!offer) {
            req.session.error = 'Resource offer not found.';
            return res.redirect('/resourceOffers');
        }

        const [matches] = await db.execute(
            `SELECT m.*,
                    hr.title,
                    hr.category,
                    hr.quantity_needed,
                    hr.location,
                    hr.urgency,
                    hr.status AS request_status,
                    f.status AS fulfillment_status,
                    f.fulfilled_quantity,
                    f.fulfilled_at
             FROM matches m
             JOIN help_requests hr ON m.help_request_id = hr.id
             LEFT JOIN fulfillments f ON f.match_id = m.id
             WHERE m.resource_offer_id = ?
             ORDER BY m.match_score DESC, m.created_at DESC`,
            [req.params.id]
        );

        res.render('resourceOffers/show', {
            offer,
            matches,
            isOwner: offer.user_id === req.session.user.id
        });
    } catch (error) {
        console.error(error);
        req.session.error = 'Unable to load resource offer details.';
        res.redirect('/resourceOffers');
    }
});

app.get('/resourceOffers/:id/edit', requireLogin, async (req, res) => {
    try {
        const [[offer]] = await db.execute(
            'SELECT * FROM resource_offers WHERE id = ? AND user_id = ?',
            [req.params.id, req.session.user.id]
        );

        if (!offer) {
            req.session.error = 'You can only edit your own resource offers.';
            return res.redirect('/resourceOffers');
        }

        res.render('resourceOffers/form', {
            offer,
            formAction: `/resourceOffers/${offer.id}/update`,
            pageTitle: 'Edit Resource Offer'
        });
    } catch (error) {
        console.error(error);
        req.session.error = 'Unable to load edit form.';
        res.redirect('/resourceOffers');
    }
});

app.post('/resourceOffers/:id/update', requireLogin, async (req, res) => {
    const { category, item_name, quantity, location, notes, status } = req.body;

    try {
        const [result] = await db.execute(
            `UPDATE resource_offers
             SET category = ?, item_name = ?, quantity = ?, location = ?, notes = ?, status = ?
             WHERE id = ? AND user_id = ?`,
            [category, item_name, quantity, location, notes || null, status, req.params.id, req.session.user.id]
        );

        if (result.affectedRows === 0) {
            req.session.error = 'You can only update your own resource offers.';
            return res.redirect('/resourceOffers');
        }

        await refreshMatchesForOffer(req.params.id);

        req.session.success = 'Resource offer updated.';
        res.redirect(`/resourceOffers/${req.params.id}`);
    } catch (error) {
        console.error(error);
        req.session.error = 'Unable to update resource offer.';
        res.redirect(`/resourceOffers/${req.params.id}/edit`);
    }
});

app.post('/resourceOffers/:id/delete', requireLogin, async (req, res) => {
    try {
        const [result] = await db.execute(
            'DELETE FROM resource_offers WHERE id = ? AND user_id = ?',
            [req.params.id, req.session.user.id]
        );

        req.session[result.affectedRows ? 'success' : 'error'] =
            result.affectedRows ? 'Resource offer deleted.' : 'You can only delete your own resource offers.';
        res.redirect('/resourceOffers');
    } catch (error) {
        console.error(error);
        req.session.error = 'Unable to delete resource offer.';
        res.redirect('/resourceOffers');
    }
});

app.post('/matches/:id/accept', requireLogin, async (req, res) => {
    const connection = await db.getConnection();

    try {
        await connection.beginTransaction();

        const [[match]] = await connection.execute(
            `SELECT m.*, ro.user_id, ro.quantity
             FROM matches m
             JOIN resource_offers ro ON m.resource_offer_id = ro.id
             WHERE m.id = ?`,
            [req.params.id]
        );

        if (!match || match.user_id !== req.session.user.id) {
            await connection.rollback();
            req.session.error = 'You can only accept matches for your own offers.';
            return res.redirect('/resourceOffers');
        }

        await connection.execute(
            'UPDATE matches SET status = ? WHERE id = ?',
            ['Accepted', req.params.id]
        );

        await connection.execute(
            'UPDATE help_requests SET status = ? WHERE id = ?',
            ['Matched', match.help_request_id]
        );

        await connection.execute(
            'UPDATE resource_offers SET status = ? WHERE id = ?',
            ['Matched', match.resource_offer_id]
        );

        await connection.execute(
            `INSERT INTO fulfillments (match_id, fulfilled_quantity, status)
             VALUES (?, ?, 'In Progress')
             ON DUPLICATE KEY UPDATE
                fulfilled_quantity = VALUES(fulfilled_quantity),
                status = 'In Progress'`,
            [req.params.id, match.quantity]
        );

        await connection.commit();
        req.session.success = 'Match accepted and fulfillment tracking started.';
        res.redirect(`/resourceOffers/${match.resource_offer_id}`);
    } catch (error) {
        await connection.rollback();
        console.error(error);
        req.session.error = 'Unable to accept match.';
        res.redirect('/resourceOffers');
    } finally {
        connection.release();
    }
});

app.post('/matches/:id/reject', requireLogin, async (req, res) => {
    try {
        const [[match]] = await db.execute(
            `SELECT m.*, ro.user_id
             FROM matches m
             JOIN resource_offers ro ON m.resource_offer_id = ro.id
             WHERE m.id = ?`,
            [req.params.id]
        );

        if (!match || match.user_id !== req.session.user.id) {
            req.session.error = 'You can only reject matches for your own offers.';
            return res.redirect('/resourceOffers');
        }

        await db.execute(
            'UPDATE matches SET status = ? WHERE id = ?',
            ['Rejected', req.params.id]
        );

        req.session.success = 'Match rejected.';
        res.redirect(`/resourceOffers/${match.resource_offer_id}`);
    } catch (error) {
        console.error(error);
        req.session.error = 'Unable to reject match.';
        res.redirect('/resourceOffers');
    }
});
app.use('/verification', verificationRoutes);
app.listen(PORT, () => {
    console.log(`CrisisHub running on http://localhost:${PORT}`);
});
