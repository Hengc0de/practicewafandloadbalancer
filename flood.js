// flood.js — DDoS simulation cannon for DP WAF training.
//
// ⚠  Only point this at a target you are authorized to test: this lab, or a
//    domain/server you or your team own/operate (e.g. one behind your own
//    DP WAF). Never run this against a third-party site.
//
// Usage:
//   node flood.js <url> [concurrency] [total-requests] [path] [method]
//   FLOOD_INSECURE=1 node flood.js <https-url> ...   (skip TLS cert checks —
//                                                      for internal/self-signed test domains)
//
// Examples:
//   node flood.js http://localhost:6060                             # lab app, 10 concurrent, 200 total
//   node flood.js https://waf-test.example.com                      # real HTTPS domain, GET /
//   node flood.js https://waf-test.example.com 50 1000               # 50 concurrent, 1000 total
//   node flood.js https://waf-test.example.com 50 1000 /login POST   # custom path + method
//   FLOOD_INSECURE=1 node flood.js https://10.30.100.32 20 500       # internal domain, self-signed cert
//
// Each request uses a unique fake X-Forwarded-For IP. Against THIS lab's
// origin (which naively trusts that header) each fake IP counts as a distinct
// client and the /api/room/enter cap kicks in. Against a REAL external domain,
// a forged X-Forwarded-For does NOT change your real source IP — a properly
// configured WAF ignores headers from untrusted clients. So testing a real
// domain is actually a truer test: it shows whether the WAF/rate-limit blocks
// a burst of requests from one real source, regardless of the header.

const http = require('http');
const https = require('https');
const { URL } = require('url');

const targetUrl   = process.argv[2];
const concurrency = Math.min(parseInt(process.argv[3]) || 10, 500);
const totalReqs   = parseInt(process.argv[4]) || 200;

if (!targetUrl) {
  console.error('\n  Usage: node flood.js <url> [concurrency] [total-requests] [path] [method]\n');
  process.exit(1);
}

const parsed = new URL(targetUrl);
const isHttps = parsed.protocol === 'https:';
const port    = parsed.port || (isHttps ? 443 : 80);
const transport = isHttps ? https : http;
const insecure = process.env.FLOOD_INSECURE === '1';

// The lab's own /api/room/enter only exists on this project's server.js —
// default to it only when the target actually looks like this lab (localhost /
// loopback / private LAN). Anywhere else (a real domain), default to GET /.
const isLabLikeHost = /^(localhost|127\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|::1)/.test(parsed.hostname);
const customPath = process.argv[5] || (isLabLikeHost ? '/api/room/enter' : '/');
const method     = (process.argv[6] || (isLabLikeHost ? 'POST' : 'GET')).toUpperCase();

let sent = 0, ok = 0, fail = 0, errs = 0, active = 0;
let done = false;

function rand(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function randIp() { return `${rand(1,255)}.${rand(0,255)}.${rand(0,255)}.${rand(0,255)}`; }

function sendOne() {
  if (done) return;
  active++;
  sent++;
  const ip = randIp();

  const req = transport.request({
    hostname: parsed.hostname,
    port,
    path: customPath,
    method,
    timeout: 5000,
    headers: { 'X-Forwarded-For': ip },
    ...(isHttps ? { rejectUnauthorized: !insecure } : {}),
  }, (res) => {
    res.resume();
    if (res.statusCode < 400) ok++;
    else fail++;
    active--;
    tick();
  });

  req.on('error', () => { errs++; active--; tick(); });
  req.on('timeout', () => { req.destroy(); errs++; active--; tick(); });
  req.end();
}

function tick() {
  while (active < concurrency && sent < totalReqs) sendOne();
  if (sent >= totalReqs && active === 0) finish();
}

function finish() {
  if (done) return;
  done = true;
  clearInterval(reporter);
  console.log('\n');
  console.log(`  URL:     ${targetUrl}`);
  console.log(`  Path:    ${customPath}`);
  console.log(`  Method:  ${method}`);
  console.log(`  Sent:    ${sent}`);
  console.log(`  OK:      ${ok}`);
  console.log(`  Blocked: ${fail}`);
  console.log(`  Errors:  ${errs} (timeout/refused/etc)`);
  if (customPath === '/api/room/enter') {
    console.log(
      `  Note:    Each origin's capacity demo ALWAYS lets its first 2 distinct IPs\n` +
      `           through by design — that's the capacity limit, not a WAF. "OK" here\n` +
      `           just means "still had a free slot," so a small OK count is expected\n` +
      `           even with zero blocking. This endpoint doesn't demonstrate WAF/DDoS\n` +
      `           blocking on its own — use it to show the capacity wall, and use a\n` +
      `           real DP WAF (or a rate-limit rule) in front to see requests actually\n` +
      `           get blocked because of the flood pattern, not the slot count.`
    );
  } else {
    console.log(`  Result:  ${ok > 0 ? 'SOME REACHED — not fully blocked' : 'ALL BLOCKED/REJECTED (403/429/503/etc)'}`);
    if (!isLabLikeHost) {
      console.log(
        `  Note:    Every request came from THIS machine's real IP — the fake\n` +
        `           X-Forwarded-For values don't change that against a real domain\n` +
        `           (a correctly configured WAF ignores untrusted client headers).\n` +
        `           This is actually the realistic test: a burst of requests from\n` +
        `           one real source. "Blocked" here means the WAF/rate-limit\n` +
        `           rejected the burst; "OK" means it got through.`
      );
    }
  }
  console.log('');
  process.exit(0);
}

console.log(`\n  Flooding ${targetUrl}${customPath}`);
console.log(`  ${concurrency}x concurrency, ${totalReqs} requests, ${method}\n`);

const reporter = setInterval(() => {
  const pct = Math.round((sent / totalReqs) * 100);
  process.stdout.write(`\r  ${sent}/${totalReqs} (${pct}%)  OK:${ok}  Blocked:${fail}  Err:${errs}  Active:${active}     `);
}, 200);

tick();