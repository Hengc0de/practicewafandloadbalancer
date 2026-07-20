// db.js — in-memory SQLite for the vulnerable login demo.
// Uses the built-in node:sqlite module (Node 22+, run with --experimental-sqlite).
//
// NOTE: This DB is used by a DELIBERATELY vulnerable query in server.js so that
// SQL injection actually works during training. Do not copy that pattern into
// real code.

const { DatabaseSync } = require('node:sqlite');

const db = new DatabaseSync(':memory:');

db.exec(`
  CREATE TABLE users (
    id       INTEGER PRIMARY KEY,
    user     TEXT NOT NULL,
    pass     TEXT NOT NULL,
    role     TEXT NOT NULL
  );
`);

// Seed accounts. The trainee only "knows" admin/secret; the injection reveals the rest.
const seed = db.prepare('INSERT INTO users (user, pass, role) VALUES (?, ?, ?)');
seed.run('admin', 'secret', 'administrator');
seed.run('lengbunheng', 'dpwaf123', 'presenter');
seed.run('guest', 'guest', 'user');

module.exports = db;
