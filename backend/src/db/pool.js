require('dotenv').config();
const { Pool } = require('pg');

const connectionString = process.env.NEON_DATABASE_URL || process.env.DATABASE_URL || null;
let pool;

if (connectionString) {
  pool = new Pool({ connectionString, ssl: { rejectUnauthorized: false } });
} else {
  pool = new Pool();
}

module.exports = { pool };
