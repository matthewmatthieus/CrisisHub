const express = require('express');
const expressLayouts = require('express-ejs-layouts');

const app = express();
const PORT = 3000;

app.use(express.static('public'));

app.set('view engine', 'ejs');

app.use(expressLayouts);

app.set('layout', 'layouts/main');

app.get('/', (req, res) => {
    res.render('index');
});

app.listen(PORT, () => {
    console.log(`CrisisHub running on http://localhost:${PORT}`);
});