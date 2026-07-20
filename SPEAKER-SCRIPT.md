# Speaker Script — DP WAF & Load Balancer Training

Plain-language, say-it-like-this script for each slide of `presentation.html`.
Simple wording on purpose — aim it at someone who has never heard "SQL injection" before.

Reminder of the setup: **you drive every attack demo on the projector.** The only thing
participants do themselves is the capacity test.

---

### Slide 1 — Title
> "Hey everyone. Today we're talking about two things that protect our websites: a **WAF**,
> which is like a security guard for our web traffic, and a **Load Balancer**, which stops one
> server from getting overwhelmed. Instead of just showing slides, I'm going to actually break
> a website in front of you — for real — and then show you how our WAF would have stopped it.
> Near the end, you'll get to try one small thing yourselves on your own phone or laptop. Should
> take about 45 minutes, and stop me anytime with questions."

---

### Slide 2 — Agenda
> "Two halves today. First half: I'll attack a website two ways — stealing a login and stealing
> someone's session — and show what a WAF can do about each one. Second half: we'll watch a
> website crash because too many people try to use it at once, and then fix it with load
> balancing. At the very end there's a few quick questions to check we're all on the same page."

---

### Slide 3 — Why this matters to NOC
> "Here's why I'm telling you this and not just the security team. When something goes wrong
> with a website, **you're usually the first ones who notice** — a ticket comes in saying 'the
> site is slow' or 'something looks weird in the logs.' A lot of the time, that 'slow site' is
> actually just too much traffic hitting one server. And that 'weird traffic' might actually be
> someone trying to break in. Both of those problems get handled by the same thing: putting a
> WAF and a load balancer in front of our servers. By the end of today you'll be able to
> recognize what both of those problems actually look like."

---

### Slide 4 — What is a WAF
> "Simple version: a WAF sits in front of our website and checks every single request before it
> reaches the actual server — kind of like a bouncer checking IDs at a door. A normal firewall
> just checks 'is this the right door and is this person even allowed near the building.' A WAF
> actually reads what's inside the request and asks 'is this person carrying something
> dangerous.' That's the difference — normal firewalls miss web attacks because they're not
> looking at that level of detail. A WAF is."

---

### Slide 5 — The lab
> "I've already got a practice website running for today — it's built to be **broken on
> purpose**, so we can attack it safely without touching anything real. For the next 10 minutes
> or so, just watch my screen — I'll do the attacking. Later, there's one part where you'll open
> a page yourselves, and I'll give you that link when we get there."

---

### Slide 6 — SQL Injection (login bypass)
> "First attack: stealing a login without knowing the password. Watch this — I'm going to type
> a weird bit of text into the username box instead of an actual username, leave the password
> blank, and... I'm in. Logged in as admin, no password needed.
>
> Here's what happened: this login page builds a question to the database by literally gluing
> your typed text into it. Normally that question is 'does a user named admin with password
> secret exist?' But what I typed changes the question itself — I basically told the database
> 'ignore the rest of this line,' so it stopped checking the password at all. The database isn't
> broken — it did exactly what it was told. The bug is that the app trusted my typed text as if
> it were a safe instruction, instead of just data.
>
> A WAF stops this by recognizing that pattern — that kind of text — and blocking the request
> before it even reaches our server."

---

### Slide 7 — Stored XSS → session theft → takeover
> "This is the big one — pay attention, because this is how small bugs become huge breaches.
>
> Step one: there's a public feedback form on this site — anyone can submit a message, no login
> needed. I'm going to submit a message, but instead of writing 'great service,' I'm pasting in
> a small piece of code.
>
> Step two: somewhere else, an admin logs in and opens their dashboard to review feedback — just
> doing their normal job, reading messages. But because this app never checks what's inside a
> feedback message before showing it, my hidden code actually **runs inside the admin's own
> browser** the moment they look at it. And that code quietly copies the admin's login cookie
> and sends it straight to me.
>
> Step three: I take that stolen cookie, paste it into my own browser, and now — I am the admin.
> No password. No phishing email. The admin didn't click a suspicious link or do anything wrong
> — they just read a message, like they do every day. That's what makes this attack so
> dangerous: it hides inside something completely normal-looking."

---

### Slide 8 — How DP WAF stops both
> "Two demos, same pattern. The SQL injection and the stored XSS both have weird content inside
> the request. A weird bit of text in a login box, hidden code inside a message. A WAF reads
> every request and recognizes 'this looks off' — and blocks it right there, before it ever
> reaches our actual website.
>
> To be clear — a WAF isn't magic, and it doesn't replace fixing the code properly. But it's a
> single checkpoint that catches known bad patterns instantly, for every app behind it, all the
> time. Now let's talk about the other half — keeping the site *up*, not just safe."

---

### Slide 9 — What is load balancing
> "Different problem now: not an attacker, just too many normal people trying to use the site at
> the same time. One server can only handle so much — too many people, and it slows down or
> falls over completely.
>
> A load balancer is the fix: instead of one server taking all the traffic, you run several
> identical copies of the server, and something sits in front deciding who goes where — so the
> load gets spread out evenly. With DP WAF, you don't even need to build that yourself — you just
> give it the addresses of your servers, and it handles the spreading for you.
>
> There's a few different ways it can decide who-goes-where — one gives busier servers less
> traffic, one always sends you to the same server so your session doesn't get confused, that
> kind of thing. We'll use the 'always the same server' one in a second."

---

### Slide 10 — Live capacity test (Phase 1 — participants join in)
> "Okay, **this next part is where you all get to actually do something.**
>
> I've set our practice server so it can only handle **2 people at once** — small on purpose so
> we can see it break quickly. I'm going to give you a link — open it on your own phone or laptop,
> not this projector.
>
> [Share the link now: `http://<host>:6060/capacity.html`]
>
> The first two of you to open it will see a green checkmark — you're connected. Everyone after
> that will see a red error — the server is full, it rejected you, using your *own* real address,
> not a trick. That's a genuine overload, happening live, in front of you."

---

### Slide 11 — Phase 2 — DP WAF fixes it
> "Now watch what happens when I turn on load balancing. I'm starting up two more copies of the
> exact same server, and putting a load balancer in front of all three.
>
> Everyone who got rejected — refresh that same page now.
>
> ...There you go — you're all in now. And if you look closely, you'll notice the page tells you
> *which* server answered you — some of you landed on server 1, some on server 2, some on server
> 3. That's the load balancer spreading everyone out so no single server gets overwhelmed. In
> real life, we wouldn't build our own balancer like I just did for this test — we'd just hand
> DP WAF our server addresses and it does exactly this automatically."

---

### Slide 12 — DDoS protection
> "One more scenario, close cousin of what we just saw: instead of a lot of *real* users showing
> up at once, imagine one attacker using thousands of fake connections trying to flood and crash
> the server on purpose — that's called a DDoS attack.
>
> DP WAF is constantly watching traffic patterns for exactly this — if one address is sending
> a suspicious flood of requests, it gets flagged and blocked automatically, before it ever
> reaches our servers. So you get two layers of protection working together: load balancing
> spreads out the *real* traffic, and this per-address blocking gets rid of the *fake* traffic."

---

### Slide 13 — Takeaways
> "So here's everything in four points, plain and simple:
> - A WAF reads every request in detail and blocks SQLi and XSS before they reach our server.
> - Load balancing spreads traffic across multiple servers so one overloaded server doesn't take
>   the whole site down.
> - Per-IP blocking stops intentional flood attacks (DDoS).
> - And you all, in NOC, are usually the first to see the warning signs — now you know what
>   those warning signs actually look like from the inside."

---

### Slide 14 — Quiz / Q&A
> "Quick check before we wrap up — few questions, feel free to just shout out answers:
> 1. Why did a normal firewall miss that login trick, but a WAF would catch it?
>    *(Because a normal firewall doesn't read what's inside the request — a WAF does.)*
> 2. The admin never clicked anything weird — so how did their login get stolen?
>    *(Hidden code inside a feedback message ran in their browser the moment they viewed it.)*
> 3. If a bunch of people share one office internet connection, they'll look like one address to
>    our server — why does that matter for the load balancer?
>    *(We want the 'same address, same server' rule so their sessions don't get mixed up, and the
>    per-address limit doesn't unfairly block a whole office.)*
> 4. If you suddenly saw a wave of errors and one IP address making almost all the requests,
>    what would you guess is happening?
>    *(Likely a flood/DDoS attempt from that address — worth blocking and confirming servers are
>    still healthy.)*
>
> That's it — thanks everyone, and I'll leave the practice site running if anyone wants to poke
> around after."