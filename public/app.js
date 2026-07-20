// app.js — frontend logic for the DP WAF training lab (v2).

/* ------------------------------------------------------------------ */
/* Feedback form (stored-XSS injection point)                          */
/* ------------------------------------------------------------------ */
function fillMsg(el) {
  document.getElementById('message').value = el.textContent;
}
async function submitFeedback() {
  const name = document.getElementById('name').value || 'anonymous';
  const message = document.getElementById('message').value;
  const out = document.getElementById('feedbackOut');
  out.className = 'muted';
  out.textContent = 'Sending…';
  try {
    const res = await fetch('/api/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, message }),
    });
    const data = await res.json();
    out.className = 'ok';
    out.textContent = data.message + '\n\nStored. Now log in as admin to trigger it.';
  } catch (e) {
    out.className = 'bad';
    out.textContent = 'Request failed: ' + e;
  }
}

/* ------------------------------------------------------------------ */
/* Admin login (SQL injection)                                         */
/* ------------------------------------------------------------------ */
function fillUser(el) {
  document.getElementById('username').value = el.textContent;
  document.getElementById('password').value = '';
}
async function doLogin() {
  const username = document.getElementById('username').value;
  const password = document.getElementById('password').value;
  const out = document.getElementById('loginOut');
  out.className = 'muted';
  out.textContent = 'Signing in…';
  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json();
    out.className = data.ok ? 'ok' : 'bad';
    out.textContent = JSON.stringify(data, null, 2);
    if (data.ok && data.redirect) {
      setTimeout(() => (window.location.href = data.redirect), 800);
    }
  } catch (e) {
    out.className = 'bad';
    out.textContent = 'Request failed: ' + e;
  }
}

/* ------------------------------------------------------------------ */
/* Attacker console                                                    */
/* ------------------------------------------------------------------ */
async function refreshLoot() {
  const body = document.getElementById('loot');
  if (!body) return; // not on attacker page
  try {
    const res = await fetch('/api/collect/list');
    const { collected } = await res.json();
    document.getElementById('count').textContent = `(${collected.length})`;
    if (!collected.length) return;
    body.innerHTML = collected
      .slice()
      .reverse()
      .map(
        (c) => `<tr>
          <td class="muted">${escapeHtml(c.time)}</td>
          <td>${escapeHtml(c.ip)}</td>
          <td><code class="loot" onclick="useToken(this)">${escapeHtml(c.data)}</code></td>
        </tr>`
      )
      .join('');
  } catch (_) {
    /* ignore transient poll errors */
  }
}
function useToken(el) {
  document.getElementById('stolen').value = el.textContent;
}
async function replay() {
  const token = document.getElementById('stolen').value;
  const out = document.getElementById('replayOut');
  out.className = 'muted';
  out.textContent = 'Replaying…';
  const res = await fetch('/api/replay', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  });
  const data = await res.json();
  out.className = data.ok ? 'ok' : 'bad';
  out.textContent = JSON.stringify(data, null, 2);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* ------------------------------------------------------------------ */
/* Capacity / IP-aware load balancing                                  */
/* ------------------------------------------------------------------ */
const USERS = [
  { label: 'User A', ip: '10.0.0.1' },
  { label: 'User B', ip: '10.0.0.2' },
  { label: 'User C', ip: '10.0.0.3' },
];
let selectedIp = USERS[0].ip;

function renderPicker() {
  const pick = document.getElementById('ippick');
  if (!pick) return;
  pick.innerHTML = USERS.map(
    (u) =>
      `<button class="ipbtn${u.ip === selectedIp ? ' active' : ''}" onclick="selectUser('${u.ip}')">
        ${u.label}<span class="ipaddr">${u.ip}</span></button>`
  ).join('');
}
function selectUser(ip) {
  selectedIp = ip;
  renderPicker();
}

async function enterRoom() {
  const out = document.getElementById('roomOut');
  const res = await fetch('/api/room/enter', {
    method: 'POST',
    headers: { 'X-Forwarded-For': selectedIp },
  });
  const data = await res.json();
  out.className = res.ok ? 'ok' : 'bad';
  out.textContent = `HTTP ${res.status}\n` + JSON.stringify(data, null, 2);
  refreshStatus();
}
async function leaveRoom() {
  const out = document.getElementById('roomOut');
  const res = await fetch('/api/room/leave', {
    method: 'POST',
    headers: { 'X-Forwarded-For': selectedIp },
  });
  const data = await res.json();
  out.className = 'muted';
  out.textContent = `IP ${data.ip} left. ${data.active.length}/${data.max} slots in use.`;
  refreshStatus();
}
async function refreshStatus() {
  const slots = document.getElementById('slots');
  if (!slots) return;
  const res = await fetch('/api/room/status');
  const { active, max } = await res.json();
  document.getElementById('cap').textContent = `(${active.length} / ${max} IPs)`;
  const cells = [];
  for (let i = 0; i < max; i++) {
    const ip = active[i];
    cells.push(
      `<div class="slot ${ip ? 'full' : 'free'}">${ip ? '🔴 ' + escapeHtml(ip) : '🟢 free'}</div>`
    );
  }
  slots.innerHTML = cells.join('');
}

/* ------------------------------------------------------------------ */
/* Live capacity (real client IP — no simulated header)                */
/* ------------------------------------------------------------------ */
let heartbeatTimer = null;

function setLive(state, icon, title, msg) {
  const box = document.getElementById('live');
  box.className = 'live ' + state;
  document.getElementById('liveIcon').textContent = icon;
  document.getElementById('liveTitle').textContent = title;
  document.getElementById('liveMsg').innerHTML = msg;
}

async function connectReal() {
  // No X-Forwarded-For here: the server uses your real IP (or the LB-supplied one).
  const res = await fetch('/api/room/enter', { method: 'POST' });
  const data = await res.json();
  document.getElementById('liveRaw').textContent = `HTTP ${res.status}\n` + JSON.stringify(data, null, 2);
  document.getElementById('myIp').textContent = data.ip || '—';
  document.getElementById('myInstance').textContent = data.instance || '—';
  document.getElementById('mySlots').textContent = `${data.active.length} / ${data.max}`;

  if (res.ok) {
    setLive('ok', '✅', "You're connected",
      `Origin <b>${escapeHtml(data.instance)}</b> is serving your IP <b>${escapeHtml(data.ip)}</b>. ` +
      `You hold 1 of ${data.max} slots on this origin.`);
    if (!heartbeatTimer) heartbeatTimer = setInterval(() => fetch('/api/room/enter', { method: 'POST' }), 10000);
  } else {
    stopHeartbeat();
    setLive('bad', '❌', 'Server overloaded — you were rejected',
      `Origin <b>${escapeHtml(data.instance)}</b> already serves ${data.max} IPs ` +
      `(${data.active.map(escapeHtml).join(', ')}). Your IP <b>${escapeHtml(data.ip)}</b> could not get in. ` +
      `<br>Behind DP WAF load balancing you'd be routed to a free origin instead.`);
  }
}

async function disconnectReal() {
  stopHeartbeat();
  const res = await fetch('/api/room/leave', { method: 'POST' });
  const data = await res.json();
  document.getElementById('liveRaw').textContent = JSON.stringify(data, null, 2);
  document.getElementById('mySlots').textContent = `${data.active.length} / ${data.max}`;
  setLive('pending', '⏸️', 'Disconnected', 'You freed your slot. Click “Try to connect again” to reclaim one.');
}

function stopHeartbeat() {
  if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; }
}

/* ------------------------------------------------------------------ */
/* Page bootstrapping                                                  */
/* ------------------------------------------------------------------ */
if (document.getElementById('live')) {
  connectReal();
  // Free the slot when the participant closes/leaves the page.
  window.addEventListener('pagehide', () => navigator.sendBeacon('/api/room/leave'));
}
if (document.getElementById('loot')) {
  refreshLoot();
  setInterval(refreshLoot, 1500);
}
if (document.getElementById('slots')) {
  renderPicker();
  refreshStatus();
  setInterval(refreshStatus, 2000);
}
