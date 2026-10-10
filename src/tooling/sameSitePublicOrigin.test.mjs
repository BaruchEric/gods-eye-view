import test from 'node:test';
import assert from 'node:assert/strict';
import {
  admitSameSite,
  configuredPublicOrigin,
} from '../../server/providers/common/same-site.js';
import { clientKey } from '../../server/providers/common/rate-limit.js';

// Fork: gev.beric.ca sits behind beric-gate, which sends these headers.
const env = { GEV_PUBLIC_ORIGIN: 'https://gev.beric.ca' };
const gateHeaders = {
  host: 'gev-app:4173',
  origin: 'https://gev.beric.ca',
  'sec-fetch-site': 'same-origin',
  'x-forwarded-host': 'gev.beric.ca',
  'x-forwarded-proto': 'http',
  'x-forwarded-for': '100.64.0.7',
};

function run(headers, runEnv = env) {
  const res = {
    statusCode: 200,
    body: '',
    setHeader() {},
    end(body) {
      this.body = body;
    },
  };
  const refused = admitSameSite({ headers, socket: {} }, res, runEnv);
  return { refused, status: res.statusCode, body: res.body };
}

test('without GEV_PUBLIC_ORIGIN a proxied request is still refused', () => {
  const r = run(gateHeaders, {});
  assert.equal(r.refused, true);
  assert.equal(r.status, 403);
  assert.match(r.body, /Proxied/);
});

test('with GEV_PUBLIC_ORIGIN the same-origin request through the gate is admitted', () => {
  assert.equal(run(gateHeaders).refused, false);
});

test('with GEV_PUBLIC_ORIGIN a foreign Origin is refused', () => {
  const r = run({ ...gateHeaders, origin: 'https://evil.example' });
  assert.equal(r.refused, true);
  assert.equal(r.status, 403);
});

test('with GEV_PUBLIC_ORIGIN the plain-http variant of the origin is refused', () => {
  assert.equal(
    run({ ...gateHeaders, origin: 'http://gev.beric.ca' }).refused,
    true,
  );
});

test('with GEV_PUBLIC_ORIGIN a cross-site fetch is refused', () => {
  assert.equal(
    run({ ...gateHeaders, 'sec-fetch-site': 'cross-site' }).refused,
    true,
  );
});

test('a forged x-forwarded-host does not change the accepted origin', () => {
  const r = run({
    ...gateHeaders,
    origin: 'https://evil.example',
    'x-forwarded-host': 'evil.example',
    'x-forwarded-proto': 'https',
  });
  assert.equal(r.refused, true);
});

test('GEV_PUBLIC_ORIGIN is normalized to its origin and junk is ignored', () => {
  assert.equal(
    configuredPublicOrigin({ GEV_PUBLIC_ORIGIN: ' https://gev.beric.ca/path ' })
      .origin,
    'https://gev.beric.ca',
  );
  assert.equal(
    configuredPublicOrigin({ GEV_PUBLIC_ORIGIN: 'not a url' }),
    null,
  );
  assert.equal(
    configuredPublicOrigin({ GEV_PUBLIC_ORIGIN: 'ftp://gev.beric.ca' }),
    null,
  );
  assert.equal(configuredPublicOrigin({}), null);
});

test('rate limits key on the gate identity only when GEV_PUBLIC_ORIGIN is set', () => {
  const req = {
    headers: { 'x-gate-user': 'member@example.com' },
    socket: { remoteAddress: '172.18.0.5' },
  };
  assert.equal(clientKey(req, env), 'gate:member@example.com');
  assert.equal(clientKey(req, {}), '172.18.0.5');
  assert.equal(
    clientKey({ headers: {}, socket: { remoteAddress: '172.18.0.5' } }, env),
    '172.18.0.5',
  );
});
