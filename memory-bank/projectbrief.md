# DP WAF & Load Balancer — Practical Training Lab

## Purpose
Hands-on lab reproducing real attacks DP WAF stops — SQLi, XSS, broken access control, session theft — and a load-balancing capacity demo. Built for live presenter-led classroom training (45 min).

## Tech Stack
- **Runtime**: Node.js 22+ (built-in `node:sqlite`, `--experimental-sqlite`)
- **Framework**: Express 4.19
- **Database**: In-memory SQLite (`DatabaseSync`)
- **Load Balancer**: Zero-dependency custom `http` proxy (IP Hash / Round Robin)
- **No frontend framework** — vanilla HTML + CSS served from `public/`

## Key Features
1. **SQL Injection demo** — login built by raw string concatenation
2. **Broken access control** — unsigned `dpwaf_session` base64 cookie with role editable client-side
3. **Stored XSS → session theft → account takeover** — full attack chain
4. **IP-aware capacity limit** — each origin caps at 2 distinct IPs; 503 for overflow
5. **Load balancing** — spreads traffic across 3 origins; participants see which origin served them

## Constraints
- ⚠ Vulnerable by design — local authorized training only
- No HTTPS, no real auth — training-only setup
- Cookie intentionally NOT `HttpOnly` or signed (for the lab)