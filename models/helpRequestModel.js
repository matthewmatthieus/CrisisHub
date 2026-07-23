const db = require('../config/db'); // Your PostgreSQL pool

// 1. GET /helpRequests (Render Index Page)
exports.getAllHelpRequests = async (req, res) => {
  try {
    const { rows: requests } = await db.query('SELECT * FROM help_requests ORDER BY created_at DESC');
    
    res.render('helpRequests/index', {
      pageTitle: 'Help Requests',
      requests,
      isAdmin: req.user ? req.user.isAdmin : false, // Adjust based on your auth setup
      success: req.flash ? req.flash('success') : null,
      error: req.flash ? req.flash('error') : null
    });
  } catch (error) {
    res.status(500).send('Server Error: ' + error.message);
  }
};

// 2. GET /helpRequests/new (Render Create Form)
exports.renderNewForm = (req, res) => {
  res.render('helpRequests/form', {
    pageTitle: 'New Help Request',
    formAction: '/helpRequests',
    request: null,
    error: null
  });
};

// 3. POST /helpRequests (Create Request)
exports.createHelpRequest = async (req, res) => {
  const { title, category, quantity_needed, location, urgency, status } = req.body;
  try {
    const requester = req.user ? req.user.name : 'Anonymous';

    await db.query(
      `INSERT INTO help_requests (title, category, quantity_needed, location, urgency, status, requester)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [title, category, quantity_needed, location, urgency, status, requester]
    );

    res.redirect('/helpRequests');
  } catch (error) {
    res.render('helpRequests/form', {
      pageTitle: 'New Help Request',
      formAction: '/helpRequests',
      request: req.body,
      error: error.message
    });
  }
};

// 4. GET /helpRequests/:id (Render Single Request Details)
exports.getHelpRequestById = async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await db.query('SELECT * FROM help_requests WHERE id = $1', [id]);

    if (rows.length === 0) {
      return res.status(404).send('Help Request not found');
    }

    res.render('helpRequests/show', {
      pageTitle: rows[0].title,
      request: rows[0],
      isAdmin: req.user ? req.user.isAdmin : false
    });
  } catch (error) {
    res.status(500).send('Server Error: ' + error.message);
  }
};

// 5. GET /helpRequests/:id/edit (Render Edit Form)
exports.renderEditForm = async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await db.query('SELECT * FROM help_requests WHERE id = $1', [id]);

    if (rows.length === 0) {
      return res.status(404).send('Help Request not found');
    }

    res.render('helpRequests/form', {
      pageTitle: 'Edit Help Request',
      formAction: `/helpRequests/${id}/update`,
      request: rows[0],
      error: null
    });
  } catch (error) {
    res.status(500).send('Server Error: ' + error.message);
  }
};

// 6. POST /helpRequests/:id/update (Update Request)
exports.updateHelpRequest = async (req, res) => {
  const { id } = req.params;
  const { title, category, quantity_needed, location, urgency, status } = req.body;

  try {
    await db.query(
      `UPDATE help_requests 
       SET title = $1, category = $2, quantity_needed = $3, location = $4, urgency = $5, status = $6, updated_at = CURRENT_TIMESTAMP
       WHERE id = $7`,
      [title, category, quantity_needed, location, urgency, status, id]
    );

    res.redirect(`/helpRequests/${id}`);
  } catch (error) {
    res.render('helpRequests/form', {
      pageTitle: 'Edit Help Request',
      formAction: `/helpRequests/${id}/update`,
      request: { ...req.body, id },
      error: error.message
    });
  }
};

// 7. POST /helpRequests/:id/delete (Delete Request)
exports.deleteHelpRequest = async (req, res) => {
  try {
    const { id } = req.params;
    await db.query('DELETE FROM help_requests WHERE id = $1', [id]);
    res.redirect('/helpRequests');
  } catch (error) {
    res.status(500).send('Server Error: ' + error.message);
  }
};