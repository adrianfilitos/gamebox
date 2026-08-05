'use strict';

const http = require('http');
const https = require('https');
const fs = require('fs');

const ML_BASE = 'http://127.0.0.1:8080';
const ML_PREFIX = '/ml';
const SUNSHINE_BASE = 'https://localhost:47990';
const SUNSHINE_USER = process.env.SUNSHINE_USER || 'gamebox';
const SUNSHINE_PASS = process.env.SUNSHINE_PASS || 'CAMBIA_ME';
const USER = process.env.ML_USER || 'admin';

function req(base, pathname, { method = 'GET', headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(base + pathname);
    const mod = url.protocol === 'https:' ? https : http;
    const req = mod.request({
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method,
      rejectUnauthorized: false,
      headers: Object.assign({ 'Content-Type': 'application/json' }, headers),
    }, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
    });
    req.on('error', reject);
    if (body) req.write(typeof body === 'string' ? body : JSON.stringify(body));
    req.end();
  });
}

function streamPair(base, pathname, headers, body, onPin) {
  return new Promise((resolve, reject) => {
    const url = new URL(base + pathname);
    const req = http.request({
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: 'POST',
      headers: Object.assign({ 'Content-Type': 'application/json' }, headers),
    }, (res) => {
      let data = '';
      res.on('data', (c) => {
        data += c;
        if (!onPin.done) {
          const m = data.match(/"Pin"\s*:\s*"?(\d{4})"?/i) || data.match(/"Pin"\s*:\s*"?([^"}]+)"?/i);
          if (m) {
            onPin.done = true;
            onPin.pin = m[1];
            onPin.cb(m[1]);
          }
        }
      });
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.setTimeout(40000, () => { console.log('pair timeout'); req.destroy(new Error('timeout')); });
    req.write(JSON.stringify(body));
    req.end();
  });
}

function sunshinePin(pin, name) {
  return new Promise((resolve, reject) => {
    const url = new URL(SUNSHINE_BASE + '/api/pin');
    const body = JSON.stringify({ pin, name });
    const req = https.request({
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method: 'POST',
      rejectUnauthorized: false,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        Authorization: 'Basic ' + Buffer.from(`${SUNSHINE_USER}:${SUNSHINE_PASS}`).toString('base64'),
      },
    }, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

(async () => {
  try {
    const hdr = { 'X-Forwarded-User': USER };
    let cookie = '';

    const hosts = await req(ML_BASE, `${ML_PREFIX}/api/hosts`, { headers: hdr });
    console.log('hosts:', hosts.status, hosts.body.slice(0, 300));
    const setCookie = hosts.headers['set-cookie'];
    if (setCookie) cookie = setCookie.map((c) => c.split(';')[0]).join('; ');

    const hdrs = Object.assign({}, hdr);
    if (cookie) hdrs.Cookie = cookie;

    let hostId = null;
    try {
      const j0 = JSON.parse(hosts.body);
      if (j0.hosts && j0.hosts.length) {
        hostId = j0.hosts[0].host_id != null ? j0.hosts[0].host_id : j0.hosts[0];
      }
    } catch (e) {}

    if (hostId == null) {
      const add = await req(ML_BASE, `${ML_PREFIX}/api/host`, { method: 'POST', headers: hdrs, body: { address: 'localhost', http_port: 47989 } });
      console.log('add host:', add.status, add.body.slice(0, 300));
      try {
        const j = JSON.parse(add.body);
        hostId = j.host && (j.host.host_id != null ? j.host.host_id : j.host);
        if (hostId == null) hostId = j.host_id;
      } catch (e) { console.log('parse add host failed', e.message); }
    }

    if (hostId != null) {
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      const onPin = { done: false, pin: null, cb: async (pin) => {
        console.log('PIN extraído:', pin);
        let ok = false;
        for (let i = 0; i < 15; i++) {
          if (i > 0) await sleep(1000);
          const sp = await sunshinePin(pin, 'GameBox');
          let accepted = false;
          try { accepted = JSON.parse(sp.body).status === true; } catch (e) {}
          console.log(`intento pin ${i + 1}:`, sp.status, sp.body.slice(0, 60));
          if (accepted) { ok = true; break; }
        }
        console.log(ok ? 'PIN ACEPTADO: emparejado' : 'PIN RECHAZADO');
      } };
      const pair = await streamPair(ML_BASE, `${ML_PREFIX}/api/pair`, hdrs, { host_id: hostId }, onPin);
      console.log('pair status:', pair.status);
      if (!onPin.done) console.log('pair body:', pair.body.slice(0, 600));
      const hosts3 = await req(ML_BASE, `${ML_PREFIX}/api/hosts`, { headers: hdrs });
      console.log('hosts final:', hosts3.body.slice(0, 400));
    }
  } catch (e) {
    console.error('ERROR', e.message);
  }
})();
