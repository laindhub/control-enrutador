import test from 'node:test';
import assert from 'node:assert/strict';
import { trustedRespaldoOrigin } from '../src/respaldo/origin.js';

function req(headers = {}) {
  const normalized = Object.fromEntries(Object.entries(headers).map(([key,value]) => [key.toLowerCase(),value]));
  return {
    // Emulate Hostinger TLS offloading and an internal http hop:
    protocol: 'http',
    get(name) { return normalized[name.toLowerCase()] || undefined; },
  };
}

const production = async (fn) => {
  const oldNodeEnv = process.env.NODE_ENV;
  const oldOrigin = process.env.RESPALDO_PUBLIC_ORIGIN;
  try {
    process.env.NODE_ENV = 'production';
    delete process.env.RESPALDO_PUBLIC_ORIGIN;
    await fn();
  } finally {
    if (oldNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = oldNodeEnv;
    if (oldOrigin === undefined) delete process.env.RESPALDO_PUBLIC_ORIGIN;
    else process.env.RESPALDO_PUBLIC_ORIGIN = oldOrigin;
  }
};

test('Hostinger TLS proxy: public HTTPS browser origin is accepted for login and API', async () => {
  await production(() => {
    const request = req({
      host: 'localhost:3000',
      origin: 'https://masduenos.laind.io',
      'x-forwarded-proto': 'http',
      'sec-fetch-site': 'same-origin',
    });
    assert.equal(trustedRespaldoOrigin(request, { allowMissing: true }), true);
    assert.equal(trustedRespaldoOrigin(request), true);
  });
});

test('Hostinger does not enable posting from another origin, including subdomains', async () => {
  await production(() => {
    for (const origin of [
      'https://evil.example',
      'https://masduenos.laind.io.evil.example',
      'https://other.laind.io',
      'http://masduenos.laind.io',
      'https://masduenos.laind.io:8443',
      'null',
      'garbage'
    ]) {
      assert.equal(trustedRespaldoOrigin(req({
        host: 'masduenos.laind.io',
        origin,
        'sec-fetch-site': 'same-origin',
      }), { allowMissing: true }), false, origin);
    }
  });
});

test('Fetch Metadata rejects cross-site even if Origin is spoofed', async () => {
  await production(() => {
    const request = req({ origin:'https://masduenos.laind.io',
      'sec-fetch-site':'cross-site' });
    assert.equal(trustedRespaldoOrigin(request, { allowMissing:true }), false);
    assert.equal(trustedRespaldoOrigin(request), false);
  });
});

test('login can omit Origin with the independent CSRF cookie; API mutations cannot', async () => {
  await production(() => {
    const request=req({ host:'localhost:3000' });
    assert.equal(trustedRespaldoOrigin(request, { allowMissing:true }), true);
    assert.equal(trustedRespaldoOrigin(request), false);
  });
});

test('override trusted public URL without trusting arbitrary proxy headers', async () => {
  await production(() => {
    process.env.RESPALDO_PUBLIC_ORIGIN = 'https://respaldo.example.org';
    assert.equal(trustedRespaldoOrigin(req({origin:'https://respaldo.example.org'})), true);
    assert.equal(trustedRespaldoOrigin(req({origin:'https://masduenos.laind.io'})), false);
    process.env.RESPALDO_PUBLIC_ORIGIN = 'http://respaldo.example.org';
    assert.equal(trustedRespaldoOrigin(req({origin:'http://respaldo.example.org'})), false);
  });
});

test('local development accepts loopback host with HTTP', () => {
  const prev=process.env.NODE_ENV;
  try {
    process.env.NODE_ENV = 'development';
    assert.equal(trustedRespaldoOrigin(req({host:'localhost:3000',origin:'http://localhost:3000'})), true);
    assert.equal(trustedRespaldoOrigin(req({host:'localhost:3000',origin:'http://evil.example'})), false);
  } finally {
    if(prev===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=prev;
  }
});
