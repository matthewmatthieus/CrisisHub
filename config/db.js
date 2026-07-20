require('dotenv').config();
const mysql = require('mysql2/promise');

const config = {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: Number(process.env.DB_PORT) || 3306,
    waitForConnections: true,
    connectionLimit: 10
};

const isLocalDatabase = ['localhost', '127.0.0.1', '::1'].includes(config.host);

if (process.env.DB_SSL !== 'false' || !isLocalDatabase) {
    config.ssl = {
        rejectUnauthorized: false
    };
}

const pool = mysql.createPool(config);

module.exports = pool;
