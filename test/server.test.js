const assert = require('node:assert/strict');
const { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const test = require('node:test');

const { app, setServerToken } = require('../server');

async function request(baseUrl, path, options) {
  const response = await fetch(`${baseUrl}${path}`, options);
  const body = await response.json();
  return { response, body };
}

test('moves selected media and only purges media staged for deletion', async t => {
  const folder = mkdtempSync(join(tmpdir(), 'image-chooser-'));
  writeFileSync(join(folder, 'keep.jpg'), 'image');
  writeFileSync(join(folder, 'notes.txt'), 'keep this note');

  const server = app.listen(0, '127.0.0.1');
  t.after(() => {
    server.close();
    rmSync(folder, { recursive: true, force: true });
  });
  await new Promise(resolve => server.once('listening', resolve));
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const setFolder = await request(baseUrl, '/api/set-folder', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ folder }),
  });
  assert.equal(setFolder.response.status, 200);
  assert.equal(setFolder.body.total, 1);

  const action = await request(baseUrl, '/api/action', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'delete' }),
  });
  assert.equal(action.response.status, 200);
  assert.equal(existsSync(join(folder, 'keep.jpg')), false);
  assert.equal(existsSync(join(folder, '_delete', 'keep.jpg')), true);

  writeFileSync(join(folder, '_delete', 'notes.txt'), 'do not purge');
  mkdirSync(join(folder, '_delete', 'nested'));

  const purge = await request(baseUrl, '/api/purge-deleted', { method: 'POST' });
  assert.equal(purge.response.status, 200);
  assert.equal(purge.body.purged, 1);
  assert.equal(existsSync(join(folder, '_delete', 'keep.jpg')), false);
  assert.equal(existsSync(join(folder, '_delete', 'notes.txt')), true);
  assert.equal(existsSync(join(folder, '_delete', 'nested')), true);

  writeFileSync(join(folder, 'collision.jpg'), 'source image');
  mkdirSync(join(folder, '_keep'), { recursive: true });
  writeFileSync(join(folder, '_keep', 'collision.jpg'), 'destination image');

  const restart = await request(baseUrl, '/api/set-folder', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ folder }),
  });
  assert.equal(restart.response.status, 200);

  const collision = await request(baseUrl, '/api/action', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'keep' }),
  });
  assert.equal(collision.response.status, 409);
  assert.equal(existsSync(join(folder, 'collision.jpg')), true);
  assert.equal(existsSync(join(folder, '_keep', 'collision.jpg')), true);
});

test('rejects unauthorized requests when access token is configured', async t => {
  const secret = 'secret-test-token-123';
  setServerToken(secret);
  const server = app.listen(0, '127.0.0.1');
  t.after(() => {
    setServerToken(null);
    server.close();
  });
  await new Promise(resolve => server.once('listening', resolve));
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  // Unauthorized request rejected with 401
  const unauthed = await request(baseUrl, '/api/session');
  assert.equal(unauthed.response.status, 401);

  // Authorized request with x-access-token header succeeds
  const authedHeader = await request(baseUrl, '/api/session', {
    headers: { 'x-access-token': secret },
  });
  assert.equal(authedHeader.response.status, 200);

  // Authorized request with token query parameter succeeds
  const authedQuery = await request(baseUrl, `/api/session?token=${secret}`);
  assert.equal(authedQuery.response.status, 200);

  // Authorized request with cookie succeeds
  const authedCookie = await request(baseUrl, '/api/session', {
    headers: { cookie: `image_chooser_token=${secret}` },
  });
  assert.equal(authedCookie.response.status, 200);
});

