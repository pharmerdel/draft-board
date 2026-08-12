import test from 'node:test';
import assert from 'node:assert/strict';

import { secureRandomInt, secureShuffle } from './secureShuffle.js';

function queuedCrypto(values) {
  const queue = [...values];
  return {
    getRandomValues(target) {
      target[0] = queue.shift() ?? 0;
      return target;
    },
  };
}

test('secureShuffle returns a permutation without mutating its input', () => {
  const source = ['a', 'b', 'c', 'd'];
  const shuffled = secureShuffle(source, queuedCrypto([1, 1, 0]));

  assert.deepEqual(source, ['a', 'b', 'c', 'd']);
  assert.deepEqual([...shuffled].sort(), source);
  assert.notDeepEqual(shuffled, source);
});

test('secureRandomInt rejects out-of-range samples to avoid modulo bias', () => {
  const value = secureRandomInt(3, queuedCrypto([0xFFFF_FFFF, 5]));
  assert.equal(value, 2);
});
