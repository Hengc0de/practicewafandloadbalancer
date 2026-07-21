# Speaker Script — DP WAF & Load Balancer Training

Cue-card wording for each slide of `presentation.html` (12-slide deck). Plain language on purpose — aimed at NOC
staff who have **never** heard of a WAF, load balancing, SQL injection, XSS, or DDoS. That's
fine; we define every term the first time it appears. Keep it scannable, not a transcript:
short sentences, say-it-like-this. (We'll also wrap up with a short offline quiz.)

Labels you'll see (so it stays a cue-card, not a wall of text):
- **ANALOGY:** a quick everyday comparison.
- **ASK:** a question to put to the audience.
- **CHECK:** a one-sentence understanding check.

Reminder: **you drive every attack demo on the projector.** The only thing participants
do themselves is the capacity test (Slide 9). Total ~28 min of content for a 45-min session.

---

## Pre-demo setup checklist

Run through this **before** the audience arrives.

- [ ] `npm install` — install dependencies (needed for the flood tooling: `node flood.js`).
- [ ] Two VPS origins are already provisioned and running the lab app — **no local multi-port
      juggling** (the old `npm run origin1/2/3 + lb` setup is retired).
- [ ] DP WAF is configured as the load balancer in front of the 2 VPS origins (IP Hash / sticky).
- [ ] Verify each VPS responds: `curl` each origin directly.
- [ ] Confirm the DP WAF dashboard shows **2 healthy upstream origins** and **IP Hash** is selected.
- [ ] Verify the three demo paths work through the site: login (`guest` / `guest`), the feedback form, and the attacker console.
- [ ] Confirm the site URL participants will use (the DP WAF-fronted address) — that's the `<site>` for the capacity test.
- [ ] Have `capacity-simulated.html` open and ready as a fallback for the capacity demo.
- [ ] Have the flood script ready (your own, or `flood.js` / `flood.html`) for the DDoS demo.
- [ ] Open the DP WAF subscription dashboard — you'll show live metrics and the **block event** during the DDoS demo.

---

### Slide 1 — DP WAF & Load Balancer Security & Resilience Training
⏱ ~1 min

Open warm, keep it short. Welcome everyone — thanks for being here.

Two things protect our websites, and you'll meet both today:
- **WAF** (Web Application Firewall) — a security guard for our web traffic.
- **Load balancer** — stops any one server from getting overwhelmed.

This isn't just slides: I'll actually break a website in front of you, then show how our
WAF would have stopped it. If you've never heard of SQL injection or XSS, you're in the
right room — we'll define every term as we go. One small hands-on moment for you near the
end. Should take about 45 minutes — stop me anytime with questions.

**ASK:** "Quick show of hands — who here has been paged for a 'slow site' or seen a weird
`503`?" (most hands = perfect hook for what's coming)

---

### Slide 2 — What we'll cover
⏱ ~1 min

Two parts today.
- **Part 1 — security:** I'll attack a site two ways — sneaking past a login and stealing
  someone's session — and show what a WAF does about each.
- **Part 2 — availability:** we'll watch a site crash because too many people use it at
  once, then fix it with load balancing.

Each half ends in a live demo — real attacks first, then a real overload and the fix.

**CHECK:** "In one sentence — what are the two problems we're fixing today?"
(security + availability)

---

### Slide 3 — You are the ones who see it first
⏱ ~2 min

When a site goes wrong, **you're usually the first to notice** — the "site is slow" ticket
or the weird string in the logs. A lot of those "slow site" tickets are really just too much
traffic hitting one server; a lot of that "weird traffic" is someone trying to break in.

Both problems get fixed by the same **edge layer** — the stuff that sits in front of our
servers — a WAF and a load balancer. By the end of today you'll recognize what both look like.

**ANALOGY:** NOC = the night-shift security desk. You watch the cameras; you're first to see
anything move.

**ASK:** "Who's taken a 3am slow-site page?" — most of those "outages" are really capacity or
attack, fixed at the edge, not on the server itself.

---

### Slide 4 — What is a WAF?
⏱ ~2 min

**WAF** = Web Application Firewall. Simple version: it sits in front of our website and checks
every single request before it reaches the server — the **origin** (the actual web app living
behind the WAF).

**ANALOGY:** A WAF is a bouncer at a club door — but one who reads what's *inside* your bag, not
just checks your ID.

A normal (network) firewall checks "is this the right door, is this person even allowed near
the building" (IP and port). A WAF actually reads the request content — URL, headers, body — and
asks "is this carrying something dangerous." That's why a normal firewall misses **SQLi** (SQL
injection) and **XSS** (cross-site scripting): it's not looking at that level of detail. A WAF is.

**CHECK:** "If the WAF is the bouncer, what's the origin?" (the actual server/app behind it)

---

### Slide 5 — Your training environment
⏱ ~1 min

I've got a practice website running — **broken on purpose**, so we can attack it safely
without touching anything real. For the next stretch, just watch my screen; I'll do the
attacking. Later there's one part where you'll open a page yourselves, and I'll give you that
link when we get there.

⚠ Vulnerable on purpose — local, authorized training only; never expose it publicly.

**ANALOGY:** Like a fire drill — we set a controlled fire in a training building, never a real one.

---

### Slide 6 — SQL Injection — login bypass
⏱ ~3 min

First attack: log in with no password.

**SQL** is the language apps use to talk to their database. **SQL injection** = sneaking extra
instructions into a form answer so the system does more than you were meant to.

**ANALOGY:** A form asks "what's your name?" You answer "John; also, delete everything." If the
app trusts your text as an instruction instead of just a name, it runs it.

**Demo:**
1. Log in normally — `guest` / `guest` (works, sets the baseline).
2. Now username: `' OR 1=1 --` (the click-to-fill chip), password blank → Sign in → **you're admin.**
3. Point at the `executedSql` panel so they see the real query.

**ASK:** "Before I click — what do you THINK will happen?" (let them guess, then click)

What happened: this login builds its database question by **gluing your typed text straight
into SQL**. The payload `' OR 1=1 --` makes the query return every row, and `--` comments out
the password check. The database isn't broken — it did exactly what it was told; the bug is
the app trusting typed text as an instruction instead of just data. Alt payload: `admin' --`
skips straight to the admin row. Real fix = **parameterized queries** (treat input as data,
never code); edge fix = DP WAF.

**If the demo fails:** ensure a trailing space after `--` (it's a SQL comment — needs the
space); confirm you're hitting the lab origin, not a real site.

**CHECK:** "In one sentence — why did that login work?" (input was treated as code, not data)

---

### Slide 7 — Stored XSS → session theft → takeover
⏱ ~4 min

The big one — pay attention, because this is how small bugs become huge breaches.

**XSS** = cross-site scripting: smuggling a script into a page so it runs in another user's
browser. **Stored XSS** = the script is saved (here, in a feedback message) and fires later when
someone views it.

**ANALOGY:** Slipping a hidden note into a comment box that makes the next reader secretly do
something — like hand over their keys.

A **session cookie** is a temporary ID that says "you're logged in as X." Think handstamp at a
club — copy someone's stamp and you get in as them.

**Demo (the showpiece):**
1. Open `/attacker.html` (the cookie collector).
2. Submit this script on `/feedback.html`:
   `<script>new Image().src='/api/collect?c='+encodeURIComponent(document.cookie)</script>`
3. Admin opens the dashboard to review feedback → payload **runs in the admin's browser** and
   beacons the cookie.
4. Attacker console → **Replay as admin.** No password, no phishing.

Why it's scary: the admin just *read* a message — normal job — and got taken over. The app
never checked what was inside a feedback message before showing it. The `dpwaf_session` cookie
is not **HttpOnly** (a flag that would stop scripts from reading it) on purpose, so the script
can read it.

**DP WAF blocks both attacks at the edge** — SQLi and XSS — the origin never sees them.
→ **Part 2:** keeping the site *up*, not just safe.

**If the demo fails:** hard-reload `/dashboard` (the browser may cache the old feedback);
confirm the `dpwaf_session` cookie is not HttpOnly; restart the server to reset the in-memory
feedback if needed. If DP WAF blocks the demo in the "behind WAF" phase — **that *is* the
point**; show the block event in the DP WAF dashboard.

**CHECK:** "The admin never typed a password — so how did the attacker log in?"
(stole + replayed the cookie)

---

### Slide 8 — What is load balancing?
⏱ ~2 min

Different problem now: not an attacker, just too many real users trying to use the site at
once. A **load balancer** spreads incoming traffic across **multiple identical origins**
(servers) so no single one is overwhelmed.

**ANALOGY:** Supermarket checkout — one long queue with one open register vs. opening six
registers and routing each shopper to the next free one. (Or a call center sending each call
to the next free agent.)

In our real setup, DP WAF **is** the load balancer — it sits in front of **2 VPS origins**
(already-running copies of the lab app) and routes each client to one of them:
`Many users → DP WAF (load balancer) → VPS-1, VPS-2`.
DP WAF load-balances across the 2 VPS origins using **IP Hash** (sticky) — a given client IP
always lands on the same VPS. (It also supports **Round Robin** — take turns, one each.)

**CHECK:** "A site can be slow for two reasons — which one is load balancing fixing?"
(too many users / capacity, not an attack)

---

### Slide 9 — One origin hits the wall
⏱ ~4 min

**This is the one hands-on moment** — hand out the link now: open `<site>/capacity.html`
(the DP WAF-fronted site). For this phase, **only ONE VPS origin** is active behind DP WAF.
That single origin serves only **2 distinct client IPs** at once (a stand-in for real capacity
limits). The first two of you: green ✅ connected. The third onward: red ❌ **HTTP 503** — a
real overload, rejected by your *own* IP, not a trick. Single origin = single capacity ceiling.

**HTTP 503** = "service unavailable — I'm too busy right now."

**ANALOGY:** A tiny shop with one clerk and a 2-customer "inside" limit; the third person stands
in the rain.

Note the **"Served by origin"** field.

**ASK:** "Third person — what did you see?" (the 503)

**If the demo fails:** not enough volunteers or flaky Wi-Fi → fall back to
`capacity-simulated.html` (simulated User A/B/C). If several people share one office router
(same public IP), IP Hash sends them all to the same VPS — the per-IP cap blocks the whole
office. That's exactly the segue to Phase 2 (spread across both VPS).

---

### Slide 10 — Put DP WAF in front → everyone's back in
⏱ ~4 min

Bring the **second VPS origin** online (enable both upstreams in the DP WAF dashboard). DP WAF's
load balancer now spreads participants across **both VPS origins** using IP Hash — same client
IP → same VPS, sticky. Now **up to 4 IPs** get in (2 per VPS × 2 VPS). Have the person who got
the 503 reload → they connect, and **"Served by origin"** now differs per person (some land on
VPS-1, some on VPS-2). That's **horizontal scale** (adding more servers, not one bigger one)
removing the single-origin wall.

**ANALOGY:** Open a second checkout register — the queue drains instantly.

**CHECK:** "Same shoppers, same moment — why does it work now?" (load spread across 2 VPS origins)

**If the demo fails:** origin unreachable behind the LB → confirm both VPS origins are healthy
in the DP WAF dashboard (`curl` each one); check that **IP Hash** is the selected algorithm so
sticky routing works.

---

### Slide 11 — DDoS protection — per-IP awareness
⏱ ~2 min

Close cousin of the capacity wall: instead of many real users, one attacker floods the service
from many fake connections — a **DDoS** (Distributed Denial of Service).

**ANALOGY:** A crowd all rushing the entrance at once so no legitimate visitor can get in.

DP WAF runs a log analyzer watching for flood patterns per IP; abusive IPs go on a block list
and FortiGate drops their traffic before the origin. LB spreads the *good* traffic; per-IP
blocking removes the *bad* — same IP-awareness you saw in the capacity demo, applied defensively.

**Demo (real, against DP WAF):**
1. You run the flood script from your own machine/IP — many rapid requests at the site.
2. DP WAF's DDoS protection detects the abnormal volume from **your real IP** and **blocks it**.
3. You then open the site in your browser → **you can no longer reach it.** DP WAF blocked your
   real client IP — that's the proof.

**Why the block is genuine:** against the real DP WAF, the fake `X-Forwarded-For` header does
nothing (DP WAF ignores untrusted client headers and sees your real source IP). So the block is
on your real IP — not a simulation.

**Flood tooling for the demo:**
- `flood.html` — browser-based, visual live log (target URL, concurrency, fake-IP count).
- `node flood.js <url> [concurrency] [total-requests]` — CLI, higher concurrency.

**Contingency:** unblock your IP afterward via the DP WAF dashboard — or run this demo **last**
so the block doesn't interrupt the rest of the session.

**CHECK:** "LB spreads the good traffic — what handles the bad?" (per-IP block list + FortiGate)

---

### Slide 12 — Takeaways for NOC
⏱ ~2 min

Four points, plain and simple:
- 🛡️ **WAF = layer-7 guard.** Blocks SQLi & XSS — what the network firewall can't see.
- ⚖️ **Load balancing = availability.** Horizontal scale removes the single-origin wall.
- 🚧 **Per-IP control = DDoS defense.** Spread the good, drop the bad, at the edge.
- 👀 **You're the first responders.** Now you know the signatures: 503 spikes, single-IP
  floods, injection strings in the logs.

One-liner: the edge (WAF + LB) enforces both security *and* availability before the origin.
Encourage them to replay the lab afterward.

**ASK:** "Which of these four will you watch for on your next shift?" (one volunteer each)

Thanks everyone — point to the README for self-study; the practice site stays up if anyone wants
to poke around after.
