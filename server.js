const express = require('express');
const expressLayouts = require('express-ejs-layouts');
const session = require('express-session');
const methodOverride = require('method-override');
const fileUpload = require('express-fileupload');
const path = require('path');
const fs = require('fs/promises');
const db = require('./config/db');
const verificationRoutes = require('./routes/verification');
const authRoutes = require('./routes/authRoutes');
const profileRoutes = require('./routes/profileRoutes');
const incidentRoutes = require('./routes/incidentRoutes');
const adminRoutes = require('./routes/adminRoutes');
const authController = require('./controllers/authController');
const { isAuthenticated, isAdmin } = require('./middleware/authMiddleware');
const { sendHelpRequestUpdateEmail } = require('./services/emailService');

const app = express();
const PORT = process.env.PORT || 3000;
const resourceUploadDir = path.join(__dirname, 'public', 'uploads', 'resources');
const incidentUploadDir = path.join(__dirname, 'public', 'uploads', 'incidents');
const allowedResourceImageExtensions = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp']);
const allowedResourceImageMimeTypes = new Set([
    'image/png',
    'image/jpeg',
    'image/gif',
    'image/webp'
]);

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
        fixit: 0,
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
        let fixitCount = { count: 0 };

        if (await tableExists('fixit_reports')) {
            const [[row]] = await db.execute(
                'SELECT COUNT(*) AS count FROM fixit_reports'
            );
            fixitCount = row;
        }

        res.locals.sidebarCounts.resourceOffers = resourceCount.count;
        res.locals.sidebarCounts.helpRequests = helpRequestCount.count;
        res.locals.sidebarCounts.incidents = incidentCount.count;
        res.locals.sidebarCounts.fixit = fixitCount.count;
        res.locals.sidebarCounts.allReports = resourceCount.count + helpRequestCount.count + incidentCount.count;
    } catch (error) {
        console.error('Unable to load sidebar counts:', error.message);
    }

    next();
});

function requireLogin(req, res, next) {
    return isAuthenticated(req, res, next);
}

function canManageOffer(offer, req) {
    if (!offer || !req.session.user) {
        return false;
    }

    return offer.user_id === req.session.user.id || req.session.user.role === 'admin';
}

async function ensureResourceOfferImageColumn() {
    const [columns] = await db.execute(
        `SHOW COLUMNS FROM resource_offers LIKE 'image_filename'`
    );

    if (columns.length === 0) {
        await db.execute(
            `ALTER TABLE resource_offers
             ADD COLUMN image_filename VARCHAR(255) NULL AFTER notes`
        );
    }
}

async function ensureIncidentImageColumn() {
    const [columns] = await db.execute(
        `SHOW COLUMNS FROM incidents LIKE 'image'`
    );

    if (columns.length === 0) {
        await db.execute(
            `ALTER TABLE incidents
             ADD COLUMN image VARCHAR(255) NULL AFTER description`
        );
    }

    const [dataColumns] = await db.execute(
        `SHOW COLUMNS FROM incidents LIKE 'image_data'`
    );

    if (dataColumns.length === 0) {
        await db.execute(
            `ALTER TABLE incidents
             ADD COLUMN image_data MEDIUMBLOB NULL AFTER image`
        );
    }

    const [mimeColumns] = await db.execute(
        `SHOW COLUMNS FROM incidents LIKE 'image_mime_type'`
    );

    if (mimeColumns.length === 0) {
        await db.execute(
            `ALTER TABLE incidents
             ADD COLUMN image_mime_type VARCHAR(100) NULL AFTER image_data`
        );
    }

    await migrateLegacyIncidentImages();
}

async function ensureEmailTables() {
    const emailColumns = [
        ['email_verified', 'BOOLEAN NOT NULL DEFAULT TRUE'],
        ['verification_token_hash', 'VARCHAR(255) NULL'],
        ['verification_token_expires_at', 'DATETIME NULL'],
        ['verification_email_sent_at', 'DATETIME NULL']
    ];

    for (const [name, definition] of emailColumns) {
        const [columns] = await db.execute(`SHOW COLUMNS FROM users LIKE '${name}'`);
        if (columns.length === 0) {
            await db.execute(`ALTER TABLE users ADD COLUMN ${name} ${definition}`);
        }
    }

    await db.execute(`
        CREATE TABLE IF NOT EXISTS password_reset_tokens (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL,
            token_hash VARCHAR(255) NOT NULL,
            expires_at DATETIME NOT NULL,
            used_at DATETIME NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            KEY idx_password_reset_token_hash (token_hash),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
    `);
}

async function migrateLegacyIncidentImages() {
    const [legacyIncidents] = await db.execute(
        `SELECT id, image
         FROM incidents
         WHERE image IS NOT NULL AND image_data IS NULL`
    );

    const mimeTypes = {
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.gif': 'image/gif',
        '.webp': 'image/webp'
    };

    for (const incident of legacyIncidents) {
        const filename = path.basename(incident.image);
        const mimeType = mimeTypes[path.extname(filename).toLowerCase()];

        if (!mimeType) {
            continue;
        }

        try {
            const imageData = await fs.readFile(path.join(incidentUploadDir, filename));
            await db.execute(
                `UPDATE incidents
                 SET image_data = ?, image_mime_type = ?, image = NULL
                 WHERE id = ? AND image_data IS NULL`,
                [imageData, mimeType, incident.id]
            );
        } catch (error) {
            if (error.code !== 'ENOENT') {
                console.error(`Unable to migrate incident image ${filename}:`, error.message);
            }
        }
    }
}

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

function getResourceImageUpload(req) {
    const upload = req.files && req.files.image;

    if (!upload) {
        return null;
    }

    return Array.isArray(upload) ? upload[0] : upload;
}

async function saveResourceOfferImage(req) {
    const upload = getResourceImageUpload(req);

    if (!upload || !upload.name) {
        return null;
    }

    const extension = path.extname(upload.name).toLowerCase();

    if (!allowedResourceImageExtensions.has(extension)
        || !allowedResourceImageMimeTypes.has(upload.mimetype)) {
        throw new Error('Only PNG, JPG, JPEG, GIF and WEBP resource images are allowed.');
    }

    await fs.mkdir(resourceUploadDir, { recursive: true });

    const safeBaseName = path.basename(upload.name, extension)
        .replace(/[^a-zA-Z0-9_-]/g, '_')
        .slice(0, 60) || 'resource';
    const filename = `${Date.now()}_${safeBaseName}${extension}`;

    await upload.mv(path.join(resourceUploadDir, filename));
    return filename;
}

async function removeResourceOfferImage(filename) {
    if (!filename) {
        return;
    }

    try {
        await fs.unlink(path.join(resourceUploadDir, filename));
    } catch (error) {
        if (error.code !== 'ENOENT') {
            console.error('Unable to remove resource image:', error.message);
        }
    }
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
app.use('/admin', adminRoutes);

app.get('/incidents', requireLogin, async (req, res) => {
    try {
        const [incidents] = await db.execute(
            `SELECT i.*, u.username AS owner_name
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
            `SELECT i.*, u.username AS owner_name
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

// =====================
// FixIt Routes
// =====================

// Show all FixIt reports
app.get("/fixit", async (req, res) => {
  try {
    const result = await db.query("SELECT * FROM fixit_reports ORDER BY created_at DESC");
    res.render("fixit/index", { fixitReports: result.rows });
  } catch (err) {
    console.error(err);
    res.render("fixit/index", { fixitReports: [], error: "Unable to load FixIt reports" });
  }
});

// Show a single FixIt report
app.get("/fixit/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const result = await db.query("SELECT * FROM fixit_reports WHERE id = $1", [id]);
    res.render("fixit/show", { fixit: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.redirect("/fixit");
  }
});

// Show FixIt form
app.get("/report/fixit", (req, res) => {
  res.render("fixit/form");
});

//Show Incident form
app.get("incidents/create", (req, res) => {
  res.render("incidents/form"); // views/incidents/form.ejs
});

// Handle FixIt form submission
app.post("/api/fixit", async (req, res) => {
  try {
    const { title, category, location, severity, description } = req.body;

    await db.query(
      "INSERT INTO fixit_reports (title, category, location, severity, description) VALUES ($1, $2, $3, $4, $5)",
      [title, category, location, severity, description]
    );

    res.redirect("/fixit");
  } catch (err) {
    console.error(err);
    res.status(500).send("Failed to submit FixIt issue");
  }
});



app.get('/helpRequests', requireLogin, async (req, res) => {
    try {
        const [requests] = await db.execute(
            `SELECT hr.*, u.username AS requester
             FROM help_requests hr
             LEFT JOIN users u ON hr.user_id = u.id
             ORDER BY hr.created_at DESC`
        );

        res.render('helpRequests/index', {
            requests,
            isAdmin:
                req.session.user &&
                req.session.user.role.toLowerCase() === 'admin'
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
            `SELECT hr.*, u.username AS requester
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
        const [[existingRequest]] = await db.execute(
            `SELECT hr.*, u.username AS requester_name, u.email AS requester_email
             FROM help_requests hr
             LEFT JOIN users u ON hr.user_id = u.id
             WHERE hr.id = ?`,
            [req.params.id]
        );

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

        if (existingRequest && existingRequest.requester_email) {
            const eventType = status === 'Matched'
                ? 'accepted'
                : status === 'Closed'
                    ? 'closed'
                    : urgency !== existingRequest.urgency
                        ? 'urgency_changed'
                        : null;

            if (eventType) {
                sendHelpRequestUpdateEmail({
                    email: existingRequest.requester_email,
                    name: existingRequest.requester_name,
                    helpRequestId: req.params.id,
                    eventType
                }).catch((emailError) => console.error('Unable to send help request email:', emailError.message));
            }
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
            `SELECT id, title, location, severity, status, image,
                    image_data IS NOT NULL AS has_image
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
                `SELECT id, item_name, category, quantity, location, status, image_filename
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
            imageUrl: incident.has_image ? `/incidents/${incident.id}/image` : null,
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
            imageUrl: offer.image_filename ? `/uploads/resources/${offer.image_filename}` : null,
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
    let imageFilename = null;

    if (!location || !location.trim()) {
        req.session.error = 'Please select or enter a valid location.';
        return res.redirect('/resourceOffers/new');
    }

    try {
        imageFilename = await saveResourceOfferImage(req);

        const [result] = await db.execute(
            `INSERT INTO resource_offers
                (user_id, category, item_name, quantity, location, notes, image_filename, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, 'Available')`,
            [
                req.session.user.id,
                category,
                item_name,
                quantity,
                location.trim(),
                notes || null,
                imageFilename
            ]
        );

        await refreshMatchesForOffer(result.insertId);

        req.session.success = 'Resource offer created and checked for matching requests.';
        res.redirect(`/resourceOffers/${result.insertId}`);
    } catch (error) {
        console.error(error);
        await removeResourceOfferImage(imageFilename);
        req.session.error = error.message.includes('resource images')
            ? error.message
            : 'Unable to create resource offer.';
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
    let imageFilename = null;

    if (!location || !location.trim()) {
        req.session.error = 'Please select or enter a valid location.';
        return res.redirect(`/resourceOffers/${req.params.id}/edit`);
    }

    try {
        const [[offer]] = await db.execute(
            'SELECT * FROM resource_offers WHERE id = ?',
            [req.params.id]
        );

        if (!canManageOffer(offer, req)) {
            req.session.error = 'You can only update your own resource offers.';
            return res.redirect('/resourceOffers');
        }

        imageFilename = await saveResourceOfferImage(req);
        const nextImageFilename = imageFilename || offer.image_filename || null;

        const [result] = await db.execute(
            `UPDATE resource_offers
             SET category = ?, item_name = ?, quantity = ?, location = ?, notes = ?, image_filename = ?, status = ?
             WHERE id = ?`,
            [
                category,
                item_name,
                quantity,
                location.trim(),
                notes || null,
                nextImageFilename,
                status,
                req.params.id
            ]
        );

        if (result.affectedRows === 0) {
            req.session.error = 'Unable to update resource offer.';
            return res.redirect('/resourceOffers');
        }

        await refreshMatchesForOffer(req.params.id);

        if (imageFilename && offer.image_filename) {
            await removeResourceOfferImage(offer.image_filename);
        }

        req.session.success = 'Resource offer updated.';
        res.redirect(`/resourceOffers/${req.params.id}`);
    } catch (error) {
        console.error(error);
        await removeResourceOfferImage(imageFilename);
        req.session.error = error.message.includes('resource images')
            ? error.message
            : 'Unable to update resource offer.';
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

        if (result.affectedRows) {
            await removeResourceOfferImage(offer.image_filename);
        }

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

async function startServer() {
    try {
        await ensureEmailTables();
        await ensureResourceOfferImageColumn();
        await ensureIncidentImageColumn();
    } catch (error) {
        console.error('Unable to prepare image upload columns:', error.message);
    }

    app.listen(PORT, () => {
        console.log(`CrisisHub running on http://localhost:${PORT}`);
    });
}

startServer();
