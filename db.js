// db.js — in-memory user store for the vulnerable login demo.
// Plain JS object (no Node version dependency). 3 hardcoded users.
//
// NOTE: Used by a DELIBERATELY vulnerable query in server.js so that
// SQL injection actually works during training. Do not copy that pattern into
// real code.

const users = [
  { id: 1, user: 'admin', pass: 'secret', role: 'administrator' },
  { id: 2, user: 'lengbunheng', pass: 'dpwaf123', role: 'presenter' },
  { id: 3, user: 'guest', pass: 'guest', role: 'user' },
];

// Mimics better-sqlite3 / node:sqlite API minimally for the queries server.js uses.
const db = {
  exec() {},
};

db.prepare = function (sql) {
  const trimmed = sql.trim().toUpperCase();
  if (trimmed === 'SELECT ID, USER, ROLE FROM USERS' || trimmed.startsWith('SELECT ID, USER, ROLE FROM USERS')) {
    return { all: () => users.map((u) => ({ id: u.id, user: u.user, role: u.role })) };
  }
  if (trimmed === "SELECT COUNT(*) C FROM USERS") {
    return { get: () => ({ c: users.length }) };
  }
  if (trimmed.startsWith('INSERT INTO USERS')) {
    return { run: () => {} };
  }
  // SELECT id, user, role FROM users WHERE user = '...' AND pass = '...'
  // This is the SQLi target. Normal queries match exact user/pass.
  // When injection changes the WHERE clause (regex fails), return admin
  // to simulate "auth bypass" — the training point.
  return {
    all: () => {
      const m = sql.match(/WHERE user\s*=\s*'([^']*)'\s*AND\s*pass\s*=\s*'([^']*)'/i);
      if (!m) {
        // Injection altered the query — simulate auth bypass for the demo.
        // Real SQLite would return the first matching row; we return admin.
        return [{ id: 1, user: 'admin', role: 'administrator' }];
      }
      const inputUser = m[1];
      const inputPass = m[2];
      return users.filter((u) => u.user === inputUser && u.pass === inputPass).map((u) => ({
        id: u.id,
        user: u.user,
        role: u.role,
      }));
    },
  };
};

module.exports = db;