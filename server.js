const express = require('express');
const expressLayouts = require('express-ejs-layouts');

const app = express();
const PORT = 3000;

// Middleware
app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// View Engine
app.set('view engine', 'ejs');
app.use(expressLayouts);
app.set('layout', 'layouts/main');

// Routes
const verificationRoutes = require('./routes/verification');

app.get('/', (req, res) => {
    res.render('index');
});

app.use('/verification', verificationRoutes);

// Start Server
app.listen(PORT, () => {
    console.log(`CrisisHub running on http://localhost:${PORT}`);
});