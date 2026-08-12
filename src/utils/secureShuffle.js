const UINT32_RANGE = 0x1_0000_0000;

export function secureRandomInt(maxExclusive, cryptoSource = globalThis.crypto) {
  if (!Number.isSafeInteger(maxExclusive) || maxExclusive < 1 || maxExclusive > UINT32_RANGE) {
    throw new RangeError('maxExclusive must be an integer between 1 and 2^32.');
  }
  if (!cryptoSource?.getRandomValues) {
    throw new Error('Secure randomness is not available in this browser.');
  }

  const rejectionLimit = Math.floor(UINT32_RANGE / maxExclusive) * maxExclusive;
  const sample = new Uint32Array(1);
  do {
    cryptoSource.getRandomValues(sample);
  } while (sample[0] >= rejectionLimit);
  return sample[0] % maxExclusive;
}

export function secureShuffle(values, cryptoSource = globalThis.crypto) {
  const shuffled = [...values];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = secureRandomInt(index + 1, cryptoSource);
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
}
