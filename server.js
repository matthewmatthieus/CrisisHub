const express = require('express');
const expressLayouts = require('express-ejs-layouts');
const session = require('express-session');
const methodOverride = require('method-override');
const fileUpload = require('express-fileupload');
const db = require('./config/db');
const verificationRoutes = require('./routes/verification');
const authRoutes = require('./routes/authRoutes');
const profileRoutes = require('./routes/profileRoutes');
const incidentRoutes = require('./routes/incidentRoutes');
const authController = require('./controllers/authController');
const { isAuthenticated, isAdmin } = require('./middleware/authMiddleware');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.static('public'));
app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use(methodOverride('_method'));
app.use(fileUpload({
    createParentPath: true,
    abortOnLimit: true,
    limits: {
        fileSize: 2 * 1024 * 1024
    }
}));
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
    res.locals.currentMapType = req.query.map || null;
    res.locals.currentUser = req.session.user || null;
    res.locals.success = req.session.success || null;
    res.locals.error = req.session.error || null;
    res.locals.warning = req.session.warning || null;
    delete req.session.success;
    delete req.session.error;
    delete req.session.warning;
    next();
});

app.use(async (req, res, next) => {
    res.locals.sidebarCounts = {
        allReports: 0,
        incidents: 0,
        helpRequests: 0,
        resourceOffers: 0,
        verification: 3
    };

    try {
        const [[resourceCount]] = await db.execute(
            'SELECT COUNT(*) AS count FROM resource_offers'
        );
        const [[helpRequestCount]] = await db.execute(
            'SELECT COUNT(*) AS count FROM help_requests'
        );
        const [[incidentCount]] = await db.execute(
            'SELECT COUNT(*) AS count FROM incidents'
        );

        res.locals.sidebarCounts.resourceOffers = resourceCount.count;
        res.locals.sidebarCounts.helpRequests = helpRequestCount.count;
        res.locals.sidebarCounts.incidents = incidentCount.count;
        res.locals.sidebarCounts.allReports = resourceCount.count + helpRequestCount.count + incidentCount.count;
    } catch (error) {
        console.error('Unable to load sidebar counts:', error.message);
    }

    next();
});

function requireLogin(req, res, next) {
    return isAuthenticated(req, res, next);
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

const singaporeLocations = [
    { names: ['ntu south spine', 'ntu'], latitude: 1.3483, longitude: 103.6831 },
    { names: ['jurong west'], latitude: 1.3404, longitude: 103.7090 },
    { names: ['jurong'], latitude: 1.3329, longitude: 103.7436 },
    { names: ['woodlands'], latitude: 1.4382, longitude: 103.7890 },
    { names: ['tampines'], latitude: 1.3521, longitude: 103.9447 },
    { names: ['yishun'], latitude: 1.4304, longitude: 103.8354 },
    { names: ['north south region', 'north singapore'], latitude: 1.4180, longitude: 103.8200 }
];

const singaporeLocationCache = new Map();

function resolveKnownSingaporeLocation(location) {
    const normalizedLocation = String(location || '').trim().toLowerCase();
    const match = singaporeLocations.find((entry) =>
        entry.names.some((name) => normalizedLocation === name)
    );

    if (match) {
        return {
            latitude: match.latitude,
            longitude: match.longitude,
            approximate: false
        };
    }

    return null;
}

async function resolveSingaporeLocation(location) {
    const normalizedLocation = String(location || '').trim().toLowerCase();
    const knownLocation = resolveKnownSingaporeLocation(location);

    if (knownLocation) {
        return knownLocation;
    }

    if (!normalizedLocation) {
        return {
            latitude: 1.3521,
            longitude: 103.8198,
            approximate: true
        };
    }

    if (singaporeLocationCache.has(normalizedLocation)) {
        return singaporeLocationCache.get(normalizedLocation);
    }

    const resolutionPromise = (async () => {
        const geocodeUrl = new URL(
            'https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates'
        );
        geocodeUrl.search = new URLSearchParams({
            SingleLine: location,
            countryCode: 'SGP',
            maxLocations: '1',
            outFields: 'Match_addr,Addr_type',
            forStorage: 'false',
            f: 'json'
        }).toString();

        try {
            const response = await fetch(geocodeUrl, {
                headers: {
                    Accept: 'application/json',
                    'User-Agent': 'CrisisHub/1.0'
                },
                signal: AbortSignal.timeout(6000)
            });

            if (!response.ok) {
                throw new Error(`ArcGIS geocoding returned ${response.status}`);
            }

            const data = await response.json();
            const candidate = Array.isArray(data.candidates) ? data.candidates[0] : null;
            const latitude = Number(candidate?.location?.y);
            const longitude = Number(candidate?.location?.x);
            const isWithinSingapore = latitude >= 1.15
                && latitude <= 1.50
                && longitude >= 103.55
                && longitude <= 104.10;

            if (candidate && candidate.score >= 70 && isWithinSingapore) {
                return {
                    latitude,
                    longitude,
                    approximate: false
                };
            }
        } catch (error) {
            console.error(`Unable to geocode location "${location}":`, error.message);
        }

        return {
            latitude: 1.3521,
            longitude: 103.8198,
            approximate: true
        };
    })();

    singaporeLocationCache.set(normalizedLocation, resolutionPromise);
    const resolvedLocation = await resolutionPromise;
    singaporeLocationCache.set(normalizedLocation, resolvedLocation);

    return resolvedLocation;
}

app.get('/', isAuthenticated, authController.showDashboard);
app.use('/auth', authRoutes);
app.use('/profile', profileRoutes);
app.use('/verification', verificationRoutes);
app.use('/incidents', incidentRoutes);


app.get('/incidents', requireLogin, async (req, res) => {
    try {
        const [incidents] = await db.execute(
            `SELECT i.*, COALESCE(u.username, u.name) AS owner_name
             FROM incidents i
             LEFT JOIN users u ON i.user_id = u.id
             ORDER BY i.created_at DESC`
        );

        res.render('incidents/index', {
            incidents,
            isAdmin: isAdminUser(req)
        });
    } catch (error) {
        console.error(error);
        req.session.error = 'Unable to load incidents.';
        res.redirect('/');
    }
});

app.get('/incidents/new', isAdmin, (req, res) => {
    res.render('incidents/form', {
        incident: null,
        formAction: '/incidents',
        pageTitle: 'Create Incident'
    });
});

app.post('/incidents', isAdmin, async (req, res) => {
    const { title, category, location, severity, status, description } = req.body;

    try {
        await db.execute(
            `INSERT INTO incidents
                (user_id, title, category, description, location, severity, status)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [req.session.user.id, title, category, description || null, location, severity, status]
        );

        req.session.success = 'Incident created successfully.';
        res.redirect('/incidents');
    } catch (error) {
        console.error(error);
        req.session.error = 'Unable to create incident.';
        res.redirect('/incidents/new');
    }
});

app.get('/incidents/:id', requireLogin, async (req, res) => {
    try {
        const [[incident]] = await db.execute(
            `SELECT i.*, COALESCE(u.username, u.name) AS owner_name
             FROM incidents i
             LEFT JOIN users u ON i.user_id = u.id
             WHERE i.id = ?`,
            [req.params.id]
        );

        if (!incident) {
            req.session.error = 'Incident not found.';
            return res.redirect('/incidents');
        }

        res.render('incidents/show', {
            incident,
            isAdmin: isAdminUser(req)
        });
    } catch (error) {
        console.error(error);
        req.session.error = 'Unable to load incident details.';
        res.redirect('/incidents');
    }
});

app.get('/incidents/:id/edit', isAdmin, async (req, res) => {
    try {
        const [[incident]] = await db.execute(
            'SELECT * FROM incidents WHERE id = ?',
            [req.params.id]
        );

        if (!incident) {
            req.session.error = 'Incident not found.';
            return res.redirect('/incidents');
        }

        res.render('incidents/form', {
            incident,
            formAction: `/incidents/${incident.id}/update`,
            pageTitle: 'Edit Incident'
        });
    } catch (error) {
        console.error(error);
        req.session.error = 'Unable to load incident edit form.';
        res.redirect('/incidents');
    }
});

app.post('/incidents/:id/update', isAdmin, async (req, res) => {
    const { title, category, location, severity, status, description } = req.body;

    try {
        const [result] = await db.execute(
            `UPDATE incidents
             SET title = ?, category = ?, description = ?, location = ?, severity = ?, status = ?
             WHERE id = ?`,
            [title, category, description || null, location, severity, status, req.params.id]
        );

        if (result.affectedRows === 0) {
            req.session.error = 'Unable to update incident.';
            return res.redirect(`/incidents/${req.params.id}/edit`);
        }

        req.session.success = 'Incident updated successfully.';
        res.redirect(`/incidents/${req.params.id}`);
    } catch (error) {
        console.error(error);
        req.session.error = 'Unable to update incident.';
        res.redirect(`/incidents/${req.params.id}/edit`);
    }
});

app.post('/incidents/:id/delete', isAdmin, async (req, res) => {
    try {
        const [result] = await db.execute(
            'DELETE FROM incidents WHERE id = ?',
            [req.params.id]
        );

        req.session[result.affectedRows ? 'success' : 'error'] =
            result.affectedRows ? 'Incident deleted successfully.' : 'Incident not found.';
        res.redirect('/incidents');
    } catch (error) {
        console.error(error);
        req.session.error = 'Unable to delete incident.';
        res.redirect('/incidents');
    }
});

app.get('/helpRequests', requireLogin, async (req, res) => {
    try {
        const [requests] = await db.execute(
            `SELECT hr.*, COALESCE(u.username, u.name) AS requester
             FROM help_requests hr
             LEFT JOIN users u ON hr.user_id = u.id
             ORDER BY hr.created_at DESC`
        );

        res.render('helpRequests/index', {
            requests,
            isAdmin: isAdminUser(req)
        });
    } catch (error) {
        console.error(error);
        req.session.error = 'Unable to load help requests.';
        res.redirect('/');
    }
});

app.get('/helpRequests/new', isAdmin, (req, res) => {
    res.render('helpRequests/form', {
        request: null,
        formAction: '/helpRequests',
        pageTitle: 'Create Help Request'
    });
});

app.post('/helpRequests', isAdmin, async (req, res) => {
    const { title, category, quantity_needed, location, urgency, status } = req.body;

    try {
        await db.execute(
            `INSERT INTO help_requests
                (user_id, title, category, quantity_needed, location, urgency, status)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [req.session.user.id, title, category, quantity_needed, location, urgency, status]
        );

        req.session.success = 'Help request created successfully.';
        res.redirect('/helpRequests');
    } catch (error) {
        console.error(error);
        req.session.error = 'Unable to create help request.';
        res.redirect('/helpRequests/new');
    }
});

app.get('/helpRequests/:id', requireLogin, async (req, res) => {
    try {
        const [[request]] = await db.execute(
            `SELECT hr.*, COALESCE(u.username, u.name) AS requester
             FROM help_requests hr
             LEFT JOIN users u ON hr.user_id = u.id
             WHERE hr.id = ?`,
            [req.params.id]
        );

        if (!request) {
            req.session.error = 'Help request not found.';
            return res.redirect('/helpRequests');
        }

        res.render('helpRequests/show', {
            request,
            isAdmin: isAdminUser(req)
        });
    } catch (error) {
        console.error(error);
        req.session.error = 'Unable to load help request details.';
        res.redirect('/helpRequests');
    }
});

app.get('/helpRequests/:id/edit', isAdmin, async (req, res) => {
    try {
        const [[request]] = await db.execute(
            'SELECT * FROM help_requests WHERE id = ?',
            [req.params.id]
        );

        if (!request) {
            req.session.error = 'Help request not found.';
            return res.redirect('/helpRequests');
        }

        res.render('helpRequests/form', {
            request,
            formAction: `/helpRequests/${request.id}/update`,
            pageTitle: 'Edit Help Request'
        });
    } catch (error) {
        console.error(error);
        req.session.error = 'Unable to load help request edit form.';
        res.redirect('/helpRequests');
    }
});

app.post('/helpRequests/:id/update', isAdmin, async (req, res) => {
    const { title, category, quantity_needed, location, urgency, status } = req.body;

    try {
        const [result] = await db.execute(
            `UPDATE help_requests
             SET title = ?, category = ?, quantity_needed = ?, location = ?, urgency = ?, status = ?
             WHERE id = ?`,
            [title, category, quantity_needed, location, urgency, status, req.params.id]
        );

        if (result.affectedRows === 0) {
            req.session.error = 'Unable to update help request.';
            return res.redirect(`/helpRequests/${req.params.id}/edit`);
        }

        req.session.success = 'Help request updated successfully.';
        res.redirect(`/helpRequests/${req.params.id}`);
    } catch (error) {
        console.error(error);
        req.session.error = 'Unable to update help request.';
        res.redirect(`/helpRequests/${req.params.id}/edit`);
    }
});

app.post('/helpRequests/:id/delete', isAdmin, async (req, res) => {
    try {
        const [result] = await db.execute(
            'DELETE FROM help_requests WHERE id = ?',
            [req.params.id]
        );

        req.session[result.affectedRows ? 'success' : 'error'] =
            result.affectedRows ? 'Help request deleted successfully.' : 'Help request not found.';
        res.redirect('/helpRequests');
    } catch (error) {
        console.error(error);
        req.session.error = 'Unable to delete help request.';
        res.redirect('/helpRequests');
    }
});

app.get('/api/map-items', isAuthenticated, async (req, res) => {
    try {
        const [incidentResults] = await db.execute(
            `SELECT id, title, location, severity, status
             FROM incidents
             ORDER BY created_at DESC`
        );
        const [helpRequestsResult, resourceOffersResult] = await Promise.all([
            db.execute(
                `SELECT id, title, category, quantity_needed, location, urgency, status
                 FROM help_requests
                 ORDER BY created_at DESC`
            ),
            db.execute(
                `SELECT id, item_name, category, quantity, location, status
                 FROM resource_offers
                 ORDER BY created_at DESC`
            )
        ]);

        const [helpRequests] = helpRequestsResult;
        const [resourceOffers] = resourceOffersResult;

        const incidents = await Promise.all(incidentResults.map(async (incident) => ({
            id: `incident-${incident.id}`,
            type: 'incident',
            title: incident.title,
            location: incident.location,
            status: incident.status,
            severity: incident.severity,
            url: `/?map=incident&item=incident-${incident.id}`,
            actionLabel: 'View Incident on Map',
            ...await resolveSingaporeLocation(incident.location)
        })));

        const requests = await Promise.all(helpRequests.map(async (request) => ({
            id: `help-request-${request.id}`,
            type: 'help-request',
            title: request.title,
            location: request.location,
            status: request.status,
            category: request.category,
            urgency: request.urgency,
            quantity: request.quantity_needed,
            url: `/?map=help-request&item=help-request-${request.id}`,
            actionLabel: 'View Request on Map',
            ...await resolveSingaporeLocation(request.location)
        })));

        const resources = await Promise.all(resourceOffers.map(async (offer) => ({
            id: `resource-${offer.id}`,
            type: 'resource',
            title: offer.item_name,
            location: offer.location,
            status: offer.status,
            category: offer.category,
            quantity: offer.quantity,
            url: `/resourceOffers/${offer.id}`,
            mapUrl: `/?map=resource&item=resource-${offer.id}`,
            actionLabel: 'Open Resource',
            ...await resolveSingaporeLocation(offer.location)
        })));

        return res.json({ items: [...incidents, ...requests, ...resources] });
    } catch (error) {
        console.error('Unable to load dashboard map items:', error);
        return res.status(500).json({ error: 'Unable to load map data.' });
    }
});

app.get('/api/location-suggestions', isAuthenticated, async (req, res) => {
    const query = String(req.query.q || '').trim();

    if (query.length < 3) {
        return res.json({ suggestions: [] });
    }

    if (query.length > 100) {
        return res.status(400).json({ error: 'Location search is too long.' });
    }

    const searchUrl = new URL(
        'https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/suggest'
    );
    searchUrl.search = new URLSearchParams({
        text: query,
        countryCode: 'SGP',
        category: 'Address,Postal',
        location: '103.8198,1.3521',
        maxSuggestions: '6',
        returnCollections: 'false',
        f: 'json'
    }).toString();

    try {
        const response = await fetch(searchUrl, {
            headers: {
                Accept: 'application/json',
                'User-Agent': 'CrisisHub/1.0'
            },
            signal: AbortSignal.timeout(6000)
        });

        if (!response.ok) {
            throw new Error(`ArcGIS location search returned ${response.status}`);
        }

        const data = await response.json();
        const suggestions = Array.isArray(data.suggestions)
            ? data.suggestions.map((suggestion) => ({
                text: suggestion.text
            }))
            : [];

        return res.json({ suggestions });
    } catch (error) {
        console.error('Unable to search Singapore locations:', error.message);
        return res.status(502).json({ error: 'Location search is temporarily unavailable.' });
    }
});

app.get('/demo/member3-login', (req, res) => {
    req.session.user = {
        id: 1,
        user_id: 1,
        username: 'Guest',
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

    if (!location || !location.trim()) {
        req.session.error = 'Please select or enter a valid location.';
        return res.redirect('/resourceOffers/new');
    }

    try {
        const [result] = await db.execute(
            `INSERT INTO resource_offers
                (user_id, category, item_name, quantity, location, notes, status)
             VALUES (?, ?, ?, ?, ?, ?, 'Available')`,
            [req.session.user.id, category, item_name, quantity, location.trim(), notes || null]
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
            isOwner: canManageOffer(offer, req)
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
            'SELECT * FROM resource_offers WHERE id = ?',
            [req.params.id]
        );

        if (!canManageOffer(offer, req)) {
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
        const [[offer]] = await db.execute(
            'SELECT * FROM resource_offers WHERE id = ?',
            [req.params.id]
        );

        if (!canManageOffer(offer, req)) {
            req.session.error = 'You can only update your own resource offers.';
            return res.redirect('/resourceOffers');
        }

        const [result] = await db.execute(
            `UPDATE resource_offers
             SET category = ?, item_name = ?, quantity = ?, location = ?, notes = ?, status = ?
             WHERE id = ?`,
            [category, item_name, quantity, location, notes || null, status, req.params.id]
        );

        if (result.affectedRows === 0) {
            req.session.error = 'Unable to update resource offer.';
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
        const [[offer]] = await db.execute(
            'SELECT * FROM resource_offers WHERE id = ?',
            [req.params.id]
        );

        if (!canManageOffer(offer, req)) {
            req.session.error = 'You can only delete your own resource offers.';
            return res.redirect('/resourceOffers');
        }

        const [result] = await db.execute(
            'DELETE FROM resource_offers WHERE id = ?',
            [req.params.id]
        );

        req.session[result.affectedRows ? 'success' : 'error'] =
            result.affectedRows ? 'Resource offer deleted.' : 'Resource offer not found.';
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

console.log("=== THIS IS THE SERVER I AM RUNNING ===");

app.listen(PORT, () => {
    console.log(`CrisisHub running on http://localhost:${PORT}`);
});
