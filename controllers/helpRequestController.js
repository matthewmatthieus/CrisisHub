const db = require('../config/db'); // Ensure correct path to your DB pool

// Helper function to dynamically calculate sidebar counts across all pages
async function getSidebarCounts() {
  try {
    const [[{ totalIncidents }]] = await db.query('SELECT COUNT(*) AS totalIncidents FROM incidents').catch(() => [[{ totalIncidents: 0 }]]);
    const [[{ totalHelp }]] = await db.query('SELECT COUNT(*) AS totalHelp FROM help_requests').catch(() => [[{ totalHelp: 0 }]]);
    const [[{ totalResources }]] = await db.query('SELECT COUNT(*) AS totalResources FROM resource_offers').catch(() => [[{ totalResources: 0 }]]);

    return {
      allReports: (totalIncidents || 0) + (totalHelp || 0) + (totalResources || 0),
      incidents: totalIncidents || 0,
      helpRequests: totalHelp || 0,
      resourceOffers: totalResources || 0,
      verification: 0
    };
  } catch (err) {
    return { allReports: 0, incidents: 0, helpRequests: 0, resourceOffers: 0, verification: 0 };
  }
}

// 1. GET ALL HELP REQUESTS
exports.getAllHelpRequests = async (req, res) => {
  try {
    const [requests] = await db.query('SELECT * FROM help_requests ORDER BY id DESC');
    const sidebarCounts = await getSidebarCounts();
    const currentUser = req.user || null;
    const isAdmin = currentUser ? Boolean(currentUser.isAdmin || currentUser.is_admin) : true;

    return res.render('helpRequests/index', {
      pageTitle: 'Help Requests',
      requests: requests || [],
      isAdmin: isAdmin,
      currentUser: currentUser,
      currentPath: req.originalUrl || '/helpRequests',
      currentMapType: null,
      sidebarCounts: sidebarCounts,
      success: req.flash ? req.flash('success') : null,
      error: req.flash ? req.flash('error') : null
    });
  } catch (error) {
    console.error('Error fetching help requests:', error);
    return res.status(500).send(`Database Error: ${error.message}`);
  }
};

// 2. RENDER NEW HELP REQUEST FORM
exports.renderNewForm = async (req, res) => {
  try {
    const sidebarCounts = await getSidebarCounts();
    const currentUser = req.user || null;

    return res.render('helpRequests/new', {
      pageTitle: 'New Help Request',
      currentUser: currentUser,
      currentPath: req.originalUrl || '/helpRequests/new',
      currentMapType: null,
      sidebarCounts: sidebarCounts,
      success: req.flash ? req.flash('success') : null,
      error: req.flash ? req.flash('error') : null
    });
  } catch (error) {
    console.error('Error rendering new form:', error);
    return res.status(500).send(`Error: ${error.message}`);
  }
};

// 3. CREATE NEW HELP REQUEST
exports.createHelpRequest = async (req, res) => {
  try {
    const userId = req.user ? (req.user.id || req.user.user_id) : 1;
    const { title, category, quantity_needed, location, urgency, status } = req.body;

    await db.query(
      `INSERT INTO help_requests (user_id, title, category, quantity_needed, location, urgency, status)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [userId, title, category, quantity_needed || 1, location, urgency || 'Low', status || 'Open']
    );

    if (req.flash) req.flash('success', 'Help request created successfully!');
    return res.redirect('/helpRequests');
  } catch (error) {
    console.error('Error creating help request:', error);
    return res.status(500).send(`Error creating request: ${error.message}`);
  }
};

// 4. GET SINGLE HELP REQUEST DETAILS
exports.getRequestDetails = async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await db.query('SELECT * FROM help_requests WHERE id = ?', [id]);

    if (!rows || rows.length === 0) {
      return res.status(404).send('Help request not found');
    }

    const request = rows[0];
    const sidebarCounts = await getSidebarCounts();
    const currentUser = req.user || null;
    const isAdmin = currentUser ? Boolean(currentUser.isAdmin || currentUser.is_admin) : true;

    return res.render('helpRequests/show', {
      pageTitle: `Help Request #${request.id}`,
      request: request,
      isAdmin: isAdmin,
      currentUser: currentUser,
      currentPath: req.originalUrl || `/helpRequests/${id}`,
      currentMapType: null,
      sidebarCounts: sidebarCounts,
      success: req.flash ? req.flash('success') : null,
      error: req.flash ? req.flash('error') : null
    });
  } catch (error) {
    console.error('Error fetching request details:', error);
    return res.status(500).send(`Database Error: ${error.message}`);
  }
};

// Alias for details view
exports.getHelpRequestById = exports.getRequestDetails;

// 5. RENDER EDIT FORM
exports.renderEditForm = async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await db.query('SELECT * FROM help_requests WHERE id = ?', [id]);

    if (!rows || rows.length === 0) {
      return res.status(404).send('Help request not found');
    }

    const request = rows[0];
    const sidebarCounts = await getSidebarCounts();
    const currentUser = req.user || null;

    return res.render('helpRequests/edit', {
      pageTitle: `Edit Help Request #${request.id}`,
      request: request,
      currentUser: currentUser,
      currentPath: req.originalUrl || `/helpRequests/${id}/edit`,
      currentMapType: null,
      sidebarCounts: sidebarCounts,
      success: req.flash ? req.flash('success') : null,
      error: req.flash ? req.flash('error') : null
    });
  } catch (error) {
    console.error('Error rendering edit form:', error);
    return res.status(500).send(`Error: ${error.message}`);
  }
};

// 6. UPDATE HELP REQUEST
exports.updateHelpRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, category, quantity_needed, location, urgency, status } = req.body;

    await db.query(
      `UPDATE help_requests 
       SET title = ?, category = ?, quantity_needed = ?, location = ?, urgency = ?, status = ?
       WHERE id = ?`,
      [title, category, quantity_needed, location, urgency, status || 'Open', id]
    );

    if (req.flash) req.flash('success', 'Help request updated successfully!');
    return res.redirect(`/helpRequests/${id}`);
  } catch (error) {
    console.error('Error updating request:', error);
    return res.status(500).send(`Error updating request: ${error.message}`);
  }
};

// 7. DELETE HELP REQUEST
exports.deleteHelpRequest = async (req, res) => {
  try {
    const { id } = req.params;
    await db.query('DELETE FROM help_requests WHERE id = ?', [id]);

    if (req.flash) req.flash('success', 'Help request deleted successfully!');
    return res.redirect('/helpRequests');
  } catch (error) {
    console.error('Error deleting request:', error);
    return res.status(500).send(`Error deleting request: ${error.message}`);
  }
};