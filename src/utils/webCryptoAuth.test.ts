import test from 'node:test';
import assert from 'node:assert/strict';
import {
  hashPasswordSha256Node,
  verifyStoredPassword,
} from '../server/teamUsers';
import {
  generateHexSalt,
  hashPasswordSha256,
  isSha256HashFormat,
  verifySha256Password,
} from './webCryptoAuth';

test('Web Crypto SHA-256 hashing produces unique salted hashes and constant-time verification', async () => {
  const first = await hashPasswordSha256('rakib@2026');
  const second = await hashPasswordSha256('rakib@2026');

  assert.equal(generateHexSalt(16).length, 32);
  assert.notEqual(first.salt, second.salt);
  assert.notEqual(first.hash, second.hash);
  assert.equal(isSha256HashFormat(first.hash), true);

  assert.equal(await verifySha256Password('rakib@2026', first.salt, first.hash), true);
  assert.equal(await verifySha256Password('wrong-pw', first.salt, first.hash), false);
  assert.equal(await verifySha256Password('rakib@2026', second.salt, first.hash), false);
  assert.equal(await verifySha256Password('rakib@2026', first.salt, 'not-a-sha256-hash'), false);
});

test('Web Crypto SHA-256 and Node SHA-256 hashes are mutually cross-verifiable across deployments', async () => {
  const browserHashed = await hashPasswordSha256('vercel@999');
  assert.equal(
    verifyStoredPassword('vercel@999', browserHashed.salt, browserHashed.hash),
    true
  );
  assert.equal(
    verifyStoredPassword('bad-pw', browserHashed.salt, browserHashed.hash),
    false
  );

  const serverHashed = hashPasswordSha256Node('express@999');
  assert.equal(
    await verifySha256Password('express@999', serverHashed.salt, serverHashed.hash),
    true
  );
  assert.equal(
    await verifySha256Password('bad-pw', serverHashed.salt, serverHashed.hash),
    false
  );
});
