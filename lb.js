// lb.js — a minimal, zero-dependency load balancer for the training lab.
//
// It sits in front of several identical origin instances (server.js) and spreads
// clients across them, setting X-Forwarded-For so each origin sees the real client
// IP. This mimics what DP WAF does ("we act as the load balancer"). In the real
// class you can use DP WAF instead — just give it the same origin URLs.
//
//   Algorithms (LB_ALGO):
//     iphash      (default) — same client IP always goes to the same origin (sticky)
//     roundrobin  — each new request to the next origin in turn
//
//   Env:
//     LB_PORT   port the balancer listens on            (default 6060)
//     ORIGINS   comma-separated origin base URLs        (default localhost:6061..6063)
//     LB_ALGO   iphash | roundrobin                     (default iphash)

const http = require('http');
const { URL } = require('url');

const LB_PORT = process.env.LB_PORT || 6060;
const ORIGINS = (process.env.ORIGINS ||
  'http://localhost:6061,http://localhost:6062,http://localhost:6063')
  .split(',').map((s) => s.trim()).filter(Boolean);
const LB_ALGO = (process.env.LB_ALGO || 'iphash').toLowerCase();

let rrCounter = 0;
function hashIp(ip) {
  let h = 0;
  for (let i = 0; i < ip.length; i++) h = (h * 31 + ip.charCodeAt(i)) >>> 0;
  return h;
}
function pickOrigin(clientIp) {
  if (LB_ALGO === 'roundrobin') return ORIGINS[rrCounter++ % ORIGINS.length];
  return ORIGINS[hashIp(clientIp) % ORIGINS.length]; // iphash (sticky)
}

const server = http.createServer((req, res) => {
  // Permissive CORS so flood/attack test tools can target the balancer from a
  // page served on a different port. Lab-only convenience.
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Forwarded-For');
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }

  const socketIp = (req.socket.remoteAddress || '0.0.0.0').replace(/^::ffff:/, '');
  // Effective client IP = the real client. In production that's the socket IP;
  // if an upstream/test already set X-Forwarded-For, honour its first value so a
  // single machine can simulate distinct clients (matches how origins read it).
  const priorXff = req.headers['x-forwarded-for'];
  const clientIp = priorXff ? String(priorXff).split(',')[0].trim() : socketIp;
  const target = new URL(pickOrigin(clientIp));

  const headers = { ...req.headers, host: target.host };
  // Forward the real client IP so the origin's IP-aware capacity logic sees it.
  headers['x-forwarded-for'] = clientIp;

  const proxied = http.request(
    { hostname: target.hostname, port: target.port, path: req.url, method: req.method, headers },
    (up) => {
      res.writeHead(up.statusCode, { ...up.headers, 'x-served-by-lb': target.host });
      up.pipe(res);
    }
  );
  proxied.on('error', (err) => {
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, message: `Origin ${target.host} unreachable: ${err.code}` }));
  });
  req.pipe(proxied);
});

server.listen(LB_PORT, () => {
  console.log(`\n  DP WAF-style load balancer on http://localhost:${LB_PORT}`);
  console.log(`  Algorithm: ${LB_ALGO}`);
  console.log('  Origins:'); ORIGINS.forEach((o) => console.log(`    - ${o}`));
  console.log('');
});
