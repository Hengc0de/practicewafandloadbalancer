// server.js — DP WAF & Load Balancer training origin server (v2).
//
// ⚠  VULNERABLE BY DESIGN. For authorized, local, hands-on training only.
//    This reproduces, on purpose, a full real-world attack chain:
//      public feedback form (stored XSS)  ->  admin login (SQL injection)
//      ->  admin dashboard renders feedback unescaped  ->  admin session
//      token exfiltrated to an attacker collector  ->  account takeover.
//    Plus an IP-aware capacity demo for the load-balancing scenario.
//    Never expose this to the public internet.

const express = require('express');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 6060;
// Identifies this origin instance when several run behind a load balancer.
const INSTANCE_ID = process.env.INSTANCE_ID || `origin-${PORT}`;

// Trust X-Forwarded-For set by the load balancer so req.ip is the real client.
app.set('trust proxy', true);
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// ---------------------------------------------------------------------------
// In-memory state
// ---------------------------------------------------------------------------
const feedbackEntries = [];       // { name, message, time }  (UNSANITIZED sink)
const collected = [];             // { data, ip, time }       (attacker loot)

// The session cookie is base64(JSON) that the server TRUSTS as-is. It is NOT
// signed — so anyone can forge/edit it in their browser to change their role.
// That is the deliberate broken-access-control vulnerability for the lab.
function encodeSession(obj) {
  return Buffer.from(JSON.stringify(obj)).toString('base64');
}
function readSession(req) {
  const c = parseCookies(req).dpwaf_session;
  if (!c) return null;
  try {
    const o = JSON.parse(Buffer.from(c, 'base64').toString('utf8'));
    if (o && o.user) return o;
  } catch (_) { /* tampered/garbage cookie */ }
  return null;
}
function isAdmin(session) {
  return !!session && (session.role === 'administrator' || session.role === 'presenter');
}
// Handy reference value trainees can paste into their own cookie to self-escalate.
const ADMIN_COOKIE = encodeSession({ user: 'admin', role: 'administrator' });

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function parseCookies(req) {
  const raw = req.headers.cookie || '';
  const out = {};
  raw.split(';').forEach((pair) => {
    const i = pair.indexOf('=');
    if (i > -1) out[pair.slice(0, i).trim()] = decodeURIComponent(pair.slice(i + 1).trim());
  });
  return out;
}

function getClientIp(req) {
  const xff = req.headers['x-forwarded-for'];
  if (xff) return String(xff).split(',')[0].trim();
  return req.socket.remoteAddress || 'unknown';
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ===========================================================================
// TEST CASE 1 — Web attacks (what DP WAF blocks)
// ===========================================================================

// -- SQL Injection: login built by raw string concatenation (NEVER do this) --
app.post('/api/login', (req, res) => {
  const user = req.body.username !== undefined && req.body.username !== null ? req.body.username : '';
  const pass = req.body.password !== undefined && req.body.password !== null ? req.body.password : '';

  // The vulnerability: user input is concatenated straight into the SQL text.
  const sql =
    `SELECT id, user, role FROM users WHERE user = '${user}' AND pass = '${pass}'`;

  try {
    const rows = db.prepare(sql).all();
    if (rows.length > 0) {
      const cookie = encodeSession({ user: rows[0].user, role: rows[0].role });
      // Deliberately NOT HttpOnly, so the stored-XSS payload can read it via
      // document.cookie; and unsigned, so it can be edited in the browser.
      // (Real mitigations: HttpOnly + a signed/server-side session — but DP WAF
      // also blocks the SQLi/XSS payloads outright before they reach the origin.)
      res.set('Set-Cookie', `dpwaf_session=${cookie}; Path=/; SameSite=Lax`);
      return res.json({
        ok: true,
        redirect: '/dashboard',
        message: `Login successful — welcome, ${rows[0].user} (${rows[0].role}).`,
        executedSql: sql,
        trainerNote: isNormalLogin(user, pass)
          ? 'Normal credential login.'
          : 'AUTH BYPASS via SQL injection — DP WAF would block this request.',
      });
    }
    return res.status(401).json({ ok: false, message: 'Invalid credentials.', executedSql: sql });
  } catch (err) {
    return res.status(400).json({
      ok: false,
      message: 'SQL error (your injection changed the query structure).',
      error: String(err.message || err),
      executedSql: sql,
    });
  }
});

function isNormalLogin(user, pass) {
  return /^[a-zA-Z0-9]+$/.test(user) && /^[a-zA-Z0-9]+$/.test(pass);
}

// -- Stored XSS sink: public feedback form, no auth, no sanitization ---------
app.post('/api/feedback', (req, res) => {
  const name = req.body.name !== undefined && req.body.name !== null ? req.body.name : 'anonymous';
  const message = req.body.message !== undefined && req.body.message !== null ? req.body.message : '';
  feedbackEntries.push({ name, message, time: new Date().toISOString() });
  res.json({ ok: true, message: 'Thanks! An administrator will review your feedback shortly.' });
});

// -- Role-based dashboard: sidebar + content depend on the cookie's role ------
app.get(['/dashboard', '/admin'], (req, res) => {
  const session = readSession(req);
  if (!session) return res.redirect('/login.html');
  const admin = isAdmin(session);
  const rawCookie = parseCookies(req).dpwaf_session || '';

  // Sidebar: normal users see a limited menu; admins get extra admin-only items.
  const userLinks = [
    ['🏠', 'Dashboard', true],
    ['👤', 'My Profile'],
    ['🎫', 'My Tickets'],
    ['❓', 'Help &amp; Support'],
  ];
  const adminLinks = [
    ['👥', 'User Management'],
    ['💬', 'All Feedback'],
    ['⚙️', 'System Settings'],
    ['📜', 'Audit Logs'],
  ];
  const sideItem = ([icon, label, active]) =>
    `<a class="side-link${active ? ' active' : ''}">${icon} <span>${label}</span></a>`;

  const sidebar = `
    <aside class="sidebar">
      <div class="side-brand"><span>DP</span> WAF Console</div>
      <div class="side-user">
        <div class="avatar">${esc(session.user[0].toUpperCase())}</div>
        <div><div class="side-name">${esc(session.user)}</div>
          <div class="side-role ${admin ? 'r-admin' : 'r-user'}">${esc(session.role)}</div></div>
      </div>
      <nav class="side-nav">
        ${userLinks.map(sideItem).join('')}
        ${admin ? `<div class="side-section">Administration</div>${adminLinks.map(sideItem).join('')}` : ''}
      </nav>
      <a class="side-link logout" href="/logout">⎋ <span>Log out</span></a>
    </aside>`;

  // Admin-only content: the stored-XSS feedback table + a user-management list.
  let adminPanels = '';
  if (admin) {
    const fb = feedbackEntries.length
      ? feedbackEntries
          // Vulnerability: message dropped into HTML unescaped -> stored XSS fires here.
          .map((e) => `<tr><td>${esc(e.name)}</td><td>${e.message}</td><td class="muted">${esc(e.time)}</td></tr>`)
          .join('')
      : `<tr><td colspan="3" class="muted">No feedback yet.</td></tr>`;
    const users = db.prepare('SELECT id, user, role FROM users').all()
      .map((u) => `<tr><td>${u.id}</td><td>${esc(u.user)}</td><td>${esc(u.role)}</td></tr>`).join('');
    adminPanels = `
      <div class="panel">
        <h2>👥 User Management <span class="tag">admin only</span></h2>
        <table class="ftable"><thead><tr><th>ID</th><th>User</th><th>Role</th></tr></thead><tbody>${users}</tbody></table>
      </div>
      <div class="panel">
        <h2>💬 All Feedback <span class="tag">admin only</span></h2>
        <table class="ftable"><thead><tr><th>From</th><th>Message</th><th>Received</th></tr></thead><tbody>${fb}</tbody></table>
        <p class="sub">This admin-only table renders each message <b>unescaped</b> — a stored
          <code>&lt;script&gt;</code> executes right here, in the admin's browser.</p>
      </div>`;
  }

  // Normal users get a nudge showing how to self-escalate by editing the cookie.
  const escalateHint = admin ? '' : `
    <div class="panel warn-panel">
      <h2>🔓 Broken access control — escalate yourself</h2>
      <p class="sub">This app trusts the <b>role</b> stored in your <code>dpwaf_session</code>
        cookie, and the cookie is <b>not signed</b>. Edit it in your browser to become admin:</p>
      <ol class="sub">
        <li>Open DevTools → <b>Application</b> → <b>Cookies</b> → this site.</li>
        <li>Replace the <code>dpwaf_session</code> value with the admin cookie below.</li>
        <li>Reload this page — the admin sidebar and panels appear.</li>
      </ol>
      <p class="sub">Admin cookie value (click to copy):</p>
      <pre class="copy" onclick="navigator.clipboard.writeText(this.textContent.trim())">${esc(ADMIN_COOKIE)}</pre>
      <p class="sub muted">Decoded, that is just <code>{"user":"admin","role":"administrator"}</code>.</p>
    </div>`;

  res.set('Content-Type', 'text/html; charset=utf-8');
  res.send(`<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${admin ? 'Admin' : 'User'} dashboard — DP WAF lab</title>
<link rel="stylesheet" href="/styles.css"></head>
<body class="app">
  ${sidebar}
  <div class="content">
    <div class="topbar">
      <div>${admin ? 'Admin' : 'User'} Dashboard</div>
      <a class="topbar-lab" href="/index.html">← training lab</a>
    </div>
    <div class="content-inner">
      <div class="banner ${admin ? 'ok-banner' : ''}">
        Signed in as <b>${esc(session.user)}</b> — role <b>${esc(session.role)}</b>.
        ${admin
          ? 'You have <b>administrator</b> access: user management, all feedback, settings.'
          : 'You are a <b>standard user</b>: limited menu, no admin panels.'}
      </div>
      <div class="cards">
        <div class="stat"><div class="stat-n">${feedbackEntries.length}</div><div class="stat-l">Feedback items</div></div>
        <div class="stat"><div class="stat-n">${db.prepare('SELECT COUNT(*) c FROM users').get().c}</div><div class="stat-l">Users</div></div>
        <div class="stat"><div class="stat-n">${admin ? '∞' : '3'}</div><div class="stat-l">Your permissions</div></div>
      </div>
      <div class="panel">
        <h2>Your session cookie</h2>
        <pre>dpwaf_session = ${esc(rawCookie)}</pre>
        <p class="sub muted">The server trusts this value verbatim — no signature, not HttpOnly.</p>
      </div>
      ${escalateHint}
      ${adminPanels}
    </div>
  </div>
  <footer>DP WAF training lab · vulnerable by design</footer>
</body></html>`);
});

app.get('/logout', (req, res) => {
  res.set('Set-Cookie', 'dpwaf_session=; Path=/; Max-Age=0');
  res.redirect('/login.html');
});

// -- Attacker exfiltration beacon --------------------------------------------
const GIF_1x1 = Buffer.from('R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==', 'base64');
app.get('/api/collect', (req, res) => {
  const data = req.query.c ?? '';
  if (data) collected.push({ data: String(data), ip: getClientIp(req), time: new Date().toISOString() });
  res.set('Content-Type', 'image/gif').send(GIF_1x1);
});

app.get('/api/collect/list', (req, res) => res.json({ collected }));

// -- Prove takeover: replay a stolen token -----------------------------------
app.post('/api/replay', (req, res) => {
  const raw = String(req.body.token !== undefined && req.body.token !== null ? req.body.token : '');
  // Attacker steals the whole cookie string; pull the dpwaf_session value out.
  const m = raw.match(/dpwaf_session=([^;\s]+)/);
  const value = m ? m[1] : raw.trim();
  let session = null;
  try {
    const o = JSON.parse(Buffer.from(value, 'base64').toString('utf8'));
    if (o && o.user) session = o;
  } catch (_) { /* not a valid session cookie */ }
  if (!session) return res.status(401).json({ ok: false, message: 'Not a valid session cookie.' });
  res.json({
    ok: true,
    message: `Account takeover confirmed — this cookie authenticates as ${session.user} (${session.role}).`,
    session,
  });
});

// ===========================================================================
// TEST CASE 2 — IP-aware capacity (why you need load balancing)
// ===========================================================================
const MAX_IPS = 2;
const SESSION_TTL_MS = 30_000;
const activeIps = new Map(); // ip -> expiry timestamp

function sweepExpired() {
  const now = Date.now();
  for (const [ip, exp] of activeIps) if (exp <= now) activeIps.delete(ip);
}

app.post('/api/room/enter', (req, res) => {
  sweepExpired();
  const ip = getClientIp(req);
  const alreadyIn = activeIps.has(ip);

  if (!alreadyIn && activeIps.size >= MAX_IPS) {
    return res.status(503).json({
      ok: false,
      ip,
      instance: INSTANCE_ID,
      active: [...activeIps.keys()],
      max: MAX_IPS,
      message:
        `Server overloaded — origin "${INSTANCE_ID}" already serves ${MAX_IPS} distinct IPs. ` +
        'Behind DP WAF load balancing you would be routed to another origin instead.',
    });
  }
  activeIps.set(ip, Date.now() + SESSION_TTL_MS);
  res.json({
    ok: true,
    ip,
    instance: INSTANCE_ID,
    reused: alreadyIn,
    active: [...activeIps.keys()],
    max: MAX_IPS,
    message: alreadyIn
      ? `IP ${ip} refreshed on origin "${INSTANCE_ID}" (IP-aware, no new slot consumed).`
      : `IP ${ip} connected to origin "${INSTANCE_ID}". ${activeIps.size} of ${MAX_IPS} slots in use.`,
  });
});

app.post('/api/room/leave', (req, res) => {
  const ip = getClientIp(req);
  activeIps.delete(ip);
  sweepExpired();
  res.json({ ok: true, ip, instance: INSTANCE_ID, active: [...activeIps.keys()], max: MAX_IPS });
});

app.get('/api/room/status', (req, res) => {
  sweepExpired();
  res.json({ instance: INSTANCE_ID, active: [...activeIps.keys()], max: MAX_IPS });
});

// ---------------------------------------------------------------------------
app.use(express.static('public'));

app.listen(PORT, () => {
  console.log(`\n  DP WAF training origin "${INSTANCE_ID}" running:  http://localhost:${PORT}`);
  console.log('  ⚠  Vulnerable by design — local training only.\n');
});
