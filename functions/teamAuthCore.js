import {
  createHmac,
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);
const ACTIVATION_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export const MAX_FAILED_ATTEMPTS = 5;
export const LOCKOUT_MS = 15 * 60 * 1000;

export function normalizeTeamId(value) {
  const teamId = String(value || '').trim();
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(teamId)) throw new Error('Invalid team identifier.');
  return teamId;
}

export function normalizeActivationCode(value) {
  const code = String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (code.length < 8 || code.length > 20) throw new Error('Invalid activation code.');
  return code;
}

export function validatePin(value) {
  const pin = String(value || '').trim();
  if (!/^\d{4,8}$/.test(pin)) throw new Error('PIN must contain 4 to 8 digits.');
  return pin;
}

export function generateActivationCode(length = 10) {
  const bytes = randomBytes(length);
  return Array.from(bytes, byte => ACTIVATION_ALPHABET[byte % ACTIVATION_ALPHABET.length]).join('');
}

export function activationCodeHash(teamId, activationCode, pepper) {
  return createHmac('sha256', requirePepper(pepper))
    .update(`activation:${normalizeTeamId(teamId)}:${normalizeActivationCode(activationCode)}`)
    .digest('hex');
}

export function secureHashEqual(actualHash, expectedHash) {
  if (!actualHash || !expectedHash) return false;
  const actual = Buffer.from(actualHash, 'hex');
  const expected = Buffer.from(expectedHash, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export async function hashPin(teamId, pin, pepper, salt = randomBytes(16).toString('hex')) {
  const normalizedPin = validatePin(pin);
  const derived = await scrypt(
    `${normalizeTeamId(teamId)}:${normalizedPin}:${requirePepper(pepper)}`,
    salt,
    32,
  );
  return { salt, hash: Buffer.from(derived).toString('hex') };
}

export async function verifyPin(teamId, pin, pepper, salt, expectedHash) {
  if (!salt || !expectedHash) return false;
  let candidate;
  try {
    candidate = await hashPin(teamId, pin, pepper, salt);
  } catch {
    return false;
  }
  return secureHashEqual(candidate.hash, expectedHash);
}

export function failedAttemptState(record, now = Date.now()) {
  const failedAttempts = Number(record?.failedAttempts || 0) + 1;
  const locked = failedAttempts >= MAX_FAILED_ATTEMPTS;
  const unlockedState = record?.state === 'locked' ? 'claimed' : (record?.state || 'claimed');
  return {
    failedAttempts: locked ? 0 : failedAttempts,
    lockUntil: locked ? now + LOCKOUT_MS : null,
    state: locked ? 'locked' : unlockedState,
  };
}

function requirePepper(value) {
  const pepper = String(value || '');
  if (pepper.length < 32) throw new Error('TEAM_AUTH_PEPPER must contain at least 32 characters.');
  return pepper;
}
