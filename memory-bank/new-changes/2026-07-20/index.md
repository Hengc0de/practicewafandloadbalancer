# Changes — 2026-07-20

## Summary

Initial project creation — DP WAF & Load Balancer practical training lab. Full vulnerable-by-design Express origin with SQLi, stored XSS, broken access control, session theft chain, plus IP-aware capacity demo and zero-dependency load balancer. Also created memory-bank documentation for the project.

### Files Affected

| File | Type | Change |
|------|------|--------|
| `server.js` | Origin server | Created — Express app with all attack endpoints + capacity API |
| `lb.js` | Load balancer | Created — HTTP proxy (IP Hash / Round Robin) |
| `db.js` | Database | Created — in-memory SQLite users table |
| `public/index.html` | Page | Created — lab landing page |
| `public/login.html` | Page | Created — SQLi vulnerable login form |
| `public/feedback.html` | Page | Created — stored XSS feedback form |
| `public/attacker.html` | Page | Created — exfiltration beacon console |
| `public/capacity.html` | Page | Created — live IP-aware capacity demo (real IPs) |
| `public/capacity-simulated.html` | Page | Created — single-laptop capacity demo (simulated IPs) |
| `public/app.js` | Script | Created — client-side JS for feedback/attacker/capacity |
| `public/styles.css` | Stylesheet | Created — styling for all pages |
| `package.json` | Config | Created — project manifest, npm scripts |
| `README.md` | Doc | Created — full walkthrough, setup, API reference |
| `SPEAKER-SCRIPT.md` | Doc | Created — 15-slide instructor script |
| `.gitignore` | Config | Created — node_modules exclusion |
| `memory-bank/projectbrief.md` | Doc | Created — project scope and constraints |
| `memory-bank/architecture.md` | Doc | Created — file map, conventions, state, API surface |
| `memory-bank/flow.md` | Doc | Created — user flows for all scenarios |
| `memory-bank/progress.md` | Doc | Created — current completion status |
| `memory-bank/new-changes/2026-07-20/index.md` | Doc | Created — this change document |

### Detailed Changes

#### Problem / Motivation
Training lab needed for DP WAF product training. Required a realistic vulnerable-by-design app demonstrating SQLi, XSS, broken access control, session theft, and load balancing — all in a single connected story.

#### What changed
- **server.js**: Express app with 9 API endpoints. Vulnerable login via raw SQL concat. Unsigned base64 session cookie. Stored XSS sink in feedback endpoint. Admin dashboard renders feedback unescaped. Attacker collector beacon returns 1×1 GIF. IP-aware room capacity with 30s TTL sweep.
- **lb.js**: Zero-dependency HTTP proxy. Two algorithms (iphash default, roundrobin via env). Sets `X-Forwarded-For` to real client IP. Health check passthrough, 502 on origin error.
- **db.js**: In-memory SQLite with 3 seeded users (admin/secret, lengbunheng/dpwaf123, guest/guest).
- **public pages**: 7 HTML pages + 1 JS + 1 CSS. Dashboard is server-rendered inline via Express route.
- **Speaker script**: Full plain-language script for 15 slides, aimed at non-technical audience.

#### Edge cases
- Tampered/invalid cookie → `readSession` returns null → redirect to login
- SQL injection that breaks query syntax → caught by try/catch, returns error with executed SQL
- Same IP re-entering room → `reused: true`, no new slot consumed
- Expired room entries → swept on every room API call via `sweepExpired()`
- Multiple X-Forwarded-For values → lb takes first, origin takes first
- IPv6 mapped addresses → `::ffff:` prefix stripped in lb

### Backend Impact

No prior backend exists — this is the initial creation.

| Endpoint | Method | Notes |
|----------|--------|-------|
| `/api/login` | POST | SQLi vulnerable, sets unsigned cookie |
| `/api/feedback` | POST | Unescaped sink for stored XSS |
| `/api/collect` | GET | Returns 1×1 GIF, logs exfiltrated data |
| `/api/collect/list` | GET | Returns captured beacons array |
| `/api/replay` | POST | Decodes and verifies stolen cookie |
| `/api/room/enter` | POST | IP-aware slot (503 at capacity) |
| `/api/room/leave` | POST | Frees caller's IP slot |
| `/api/room/status` | GET | Returns active IPs and max |

### Bet Endpoint Impact

N/A — no betting endpoints in this project.

### Client-side code that can be relaxed

N/A — no client-side computation that backend could absorb.