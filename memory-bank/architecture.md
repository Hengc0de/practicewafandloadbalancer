# Architecture

## File Map

```
├── server.js            Express origin app — all endpoints, vulnerable by design
├── lb.js                HTTP proxy load balancer (IP Hash / Round Robin)
├── db.js                In-memory SQLite (users table) via node:sqlite
├── package.json         Scripts: start, origin1-3, lb
├── public/
│   ├── index.html       Lab front page
│   ├── login.html       SQLi login form
│   ├── dashboard/       Served by Express /dashboard route (inline HTML)
│   ├── feedback.html    Stored XSS sink form
│   ├── attacker.html    Exfiltration beacon console
│   ├── capacity.html    Live IP-aware capacity demo (real client IPs)
│   ├── capacity-simulated.html  Single-laptop capacity demo (simulated IPs)
│   ├── app.js           Client-side JS
│   └── styles.css       Styling
├── memory-bank/         Project documentation
└── SPEAKER-SCRIPT.md    Instructor script for each slide
```

## Key Conventions

- **Training-only code**: no production hardening. Vulnerabilities are deliberate.
- **Cookie-based session**: unsigned base64 JSON in `dpwaf_session`. Role checked in `isAdmin()`.
- **IP-aware capacity**: in-memory `Map<ip, expiry>` per origin. Sweeps expired entries every request.
- **Load balancer**: pure `http` module. Sets `X-Forwarded-For` = real client IP. Origins trust `trust proxy`.
- **Node 22+ required** for `node:sqlite` (`--experimental-sqlite` flag).

## State Shape (In-Memory)

### server.js (per origin instance)
| Variable | Type | Purpose |
|----------|------|---------|
| `feedbackEntries` | `Array<{name, message, time}>` | Untrusted sink for stored XSS |
| `collected` | `Array<{data, ip, time}>` | Captured exfiltrated beacons |
| `activeIps` | `Map<ip, expiry timestamp>` | IP-aware room capacity |

## API Surface

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/login` | Vulnerable SQLi login; sets unsigned `dpwaf_session` cookie |
| GET | `/dashboard` | Role-based dashboard; admin panels render feedback unescaped |
| POST | `/api/feedback` | Public unsanitized feedback sink |
| GET | `/api/collect?c=` | Attacker beacon (returns 1×1 GIF) |
| GET | `/api/collect/list` | Show captured beacons |
| POST | `/api/replay` | Replay stolen cookie — proves takeover |
| POST | `/api/room/enter` | Take IP slot (503 at capacity) |
| POST | `/api/room/leave` | Free IP slot |
| GET | `/api/room/status` | Room status `{active, max}` |