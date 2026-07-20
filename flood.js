// flood.js — DDoS simulation cannon for DP WAF training.
//
// Usage:
//   node flood.js <url> [concurrency] [total-requests]
//
// Examples:
//   node flood.js http://localhost:6060              # 10 concurrent, 200 total
//   node flood.js https://example.com 50 1000        # 50 concurrent, 1000 total
//   node flood.js http://localhost:6060 20 500       # 20 concurrent, 500 total
//
// Each request gets a unique fake X-Forwarded-For IP. The origin sees
// each as a distinct client. /api/room/enter allows only 2 IPs — the
// rest get HTTP 503. DP WAF per-IP blocking catches this at the edge.

const http = require('http');
const https = require('https');
const { URL } = require('url');

const targetUrl = process.argv[2];
const concurrency = Math.min(parseInt(process.argv[3]) || 10, 500);
const totalReqs  = parseInt(process.argv[4]) || 200;

if (!targetUrl) {
  console.error('\n  Usage: node flood.js <url> [concurrency] [total-requests]\n');
  process.exit(1);
}

const parsed = new URL(targetUrl);
const isHttps  = parsed.protocol === 'https:';
const port     = parsed.port || (isHttps ? 443 : 80);
const transport = isHttps ? https : http;

let sent = 0, ok = 0, fail = 0, errs = 0, active = 0;
let done = false;

function rand(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function randIp()  { return `${rand(1,255)}.${rand(0,255)}.${rand(0,255)}.${rand(0,255)}`; }

function sendOne() {
  if (done) return;
  active++;
  sent++;
  const ip = randIp();

  const req = transport.request({
    hostname: parsed.hostname,
    port,
    path: '/api/room/enter',
    method: 'POST',
    headers: { 'X-Forwarded-For': ip, 'Content-Type': 'application/json' },
  }, (res) => {
    res.resume();
    if (res.statusCode < 400) ok++;
    else fail++;
    active--;
    tick();
  });

  req.on('error', () => { errs++; active--; tick(); });
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
  console.log(`  Sent:    ${sent}`);
  console.log(`  OK:      ${ok}`);
  console.log(`  Blocked: ${fail}`);
  console.log(`  Errors:  ${errs}`);
  console.log(`  Result:  ${ok > 0 ? 'SOME REACHED ORIGIN — WAF not blocking' : 'ALL BLOCKED — WAF is working or origin rejecting'}`);
  console.log('');
  process.exit(0);
}

console.log(`\n  Flooding ${targetUrl} :${port}/api/room/enter`);
console.log(`  ${concurrency}x concurrency, ${totalReqs} requests\n`);

const reporter = setInterval(() => {
  const pct = Math.round((sent / totalReqs) * 100);
  process.stdout.write(`\r  ${sent}/${totalReqs} (${pct}%)  OK:${ok}  Blocked:${fail}  Err:${errs}  Active:${active}     `);
}, 200);

tick();