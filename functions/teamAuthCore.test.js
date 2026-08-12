import test from 'node:test';
import assert from 'node:assert/strict';

import {
  LOCKOUT_MS,
  MAX_FAILED_ATTEMPTS,
  activationCodeHash,
  failedAttemptState,
  generateActivationCode,
  hashPin,
  normalizeActivationCode,
  secureHashEqual,
  validatePin,
  verifyPin,
} from './teamAuthCore.js';

const pepper = 'test-pepper-with-more-than-thirty-two-characters';

test('activation codes normalize and hash deterministically', () => {
  const code = generateActivationCode();
  assert.equal(code.length, 10);
  assert.equal(normalizeActivationCode(`${code.slice(0, 5)}-${code.slice(5)}`), code);
  assert.equal(activationCodeHash('team_1', code, pepper), activationCodeHash('team_1', code, pepper));
  assert.notEqual(activationCodeHash('team_1', code, pepper), activationCodeHash('team_2', code, pepper));
  assert.equal(secureHashEqual(activationCodeHash('team_1', code, pepper), activationCodeHash('team_1', code, pepper)), true);
  assert.equal(secureHashEqual('ab', 'cd'), false);
});

test('PIN hashes use a salt and verify without exposing the PIN', async () => {
  const first = await hashPin('team_1', '2468', pepper);
  const second = await hashPin('team_1', '2468', pepper);
  assert.notEqual(first.hash, second.hash);
  assert.equal(await verifyPin('team_1', '2468', pepper, first.salt, first.hash), true);
  assert.equal(await verifyPin('team_1', '1357', pepper, first.salt, first.hash), false);
  assert.equal(first.hash.includes('2468'), false);
});

test('PIN validation accepts only 4 to 8 digits', () => {
  assert.equal(validatePin('1234'), '1234');
  assert.throws(() => validatePin('123'));
  assert.throws(() => validatePin('12a4'));
});

test('failed attempts create a temporary lockout', () => {
  let record = { state: 'claimed', failedAttempts: 0 };
  const now = 1000;
  for (let attempt = 1; attempt <= MAX_FAILED_ATTEMPTS; attempt++) {
    record = { ...record, ...failedAttemptState(record, now) };
  }
  assert.equal(record.state, 'locked');
  assert.equal(record.lockUntil, now + LOCKOUT_MS);
});

test('an expired lock returns to claimed until the next threshold', () => {
  const now = 2_000;
  const record = failedAttemptState({ state: 'locked', failedAttempts: 0, lockUntil: now - 1 }, now);

  assert.equal(record.state, 'claimed');
  assert.equal(record.failedAttempts, 1);
  assert.equal(record.lockUntil, null);
});
