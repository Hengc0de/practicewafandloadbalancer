// flood.js — DDoS simulation for DP WAF training.
//
// USAGE:
//   node flood.js <url> [concurrency] [total-requests]
//
// EXAMPLES:
//   node flood.js http://localhost:6060          // 10 concurrent, 200 total
//   node flood.js https://example.com 50 1000    // 50 concurrent, 1000 total
//   node flood.js http://localhost:6060 20 500   // 20 concurrent, 500 total
//
// Each request uses a different fake X-Forwarded-For IP so the origin
// sees each as a distinct client. The origin's /api/room/enter endpoint
// caps at 2 IPs — everything beyond that gets HTTP 503.
// DP WAF per-IP blocking would catch this at the edge.

const http = require('http');
const https = require('https');
const { URL } = require('url');

const targetUrl = process.argv[2];
const concurrency = parseInt(process.argv[3]) || 10;
const totalReqs = parseInt(process.argv[4]) || 200;

if (!targetUrl) {
  console.error('\n  Usage: node flood.js <url> [concurrency] [total-requests]\n');
  console.error('  Examples:');
  console.error('    node flood.js http://localhost:6060');
  console.error('    node flood.js https://example.com 50 1000\n');
  process.exit(1);
}

const parsed = new URL(targetUrl);
const isHttps = parsed.protocol === 'https:';
const transport = isHttps ? https : http;

let ok = 0, fail = 0, errs = 0;
let active = 0;
let done = false;
let started = 0;

function randomIp() {
  return `${rand(1,255)}.${rand(0,255)}.${rand(0,255)}.${rand(0,255)}`;
}
function rand(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function sendOne(callback) {
  const ip = randomIp();
  const options = {
    hostname: parsed.hostname,
    port: parsed.port || (isHttps ? 443 : 80),
    path: '/api/room/enter',
    method: 'POST',
    headers: {
      'X-Forwarded-For': ip,
      'Content-Type': 'application/json',
    },
  };

  const req = transport.request(options, (res) => {
    res.resume();
    if (res.statusCode < 400) ok++;
    else fail++;
    callback();
  });
  req.on('error', () => { errs++; callback(); });
  req.end();
}

function startBatch() {
  while (active < concurrency && started < totalReqs) {
    active++;
    started++;
    const n = started;
    sendOne(() => {
      active--;
      if (!done) printStats();
      if (started >= totalReqs && active === 0) finish();
      else if (started < totalReqs && active < concurrency) startBatch();
    });
  }
}

function printStats() {
  const pct = Math.round((started / totalReqs) * 100);
  process.stdout.write(`\r  ${started}/${totalReqs} (${pct}%)  OK:${ok}  Fail:${fail}  Err:${errs}     `);
}

function finish() {
  done = true;
  console.log('\n');
  console.log(`  Target:   ${targetUrl}`);
  console.log(`  Sent:     ${totalReqs}`);
  console.log(`  OK:       ${ok}`);
  console.log(`  Rejected: ${fail}`);
  console.log(`  Errors:   ${errs}`);
  console.log(`  Result:   ${ok > 0 ? 'Origin accepted some — WAF not blocking?' : 'All blocked — WAF is working or origin rejecting'}`);
  console.log('');
  process.exit(0);
}

console.log(`\n  Flooding ${targetUrl} — ${concurrency}x concurrency, ${totalReqs} total requests\n`);
setInterval(printStats, 500);
startBatch();