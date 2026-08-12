import { initializeApp, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getDatabase } from 'firebase-admin/database';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';

import {
  activationCodeHash,
  failedAttemptState,
  generateActivationCode,
  hashPin,
  normalizeActivationCode,
  normalizeTeamId,
  secureHashEqual,
  validatePin,
  verifyPin,
} from './teamAuthCore.js';

if (!getApps().length) initializeApp();

const teamAuthPepper = defineSecret('TEAM_AUTH_PEPPER');
const commissionerSetupCode = defineSecret('COMMISSIONER_SETUP_CODE');
const REGION = 'us-central1';
const ACTIVATION_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;
const GENERIC_AUTH_ERROR = 'Unable to authenticate this team.';

function callableOptions(secrets = [teamAuthPepper]) {
  return { region: REGION, secrets, enforceAppCheck: false };
}

function requireCommissioner(request) {
  if (request.auth?.token?.role !== 'commissioner') {
    throw new HttpsError('permission-denied', 'Commissioner authentication is required.');
  }
}

function ownerClaims(teamId, accessVersion) {
  return { role: 'owner', teamId, accessVersion: Number(accessVersion || 1) };
}

async function mintOwnerToken(teamId, accessVersion) {
  return getAuth().createCustomToken(`team:${teamId}`, ownerClaims(teamId, accessVersion));
}

async function mintCommissionerToken(accessVersion) {
  return getAuth().createCustomToken('commissioner:primary', {
    role: 'commissioner',
    accessVersion: Number(accessVersion || 1),
  });
}

async function ensureTeamExists(teamId) {
  const snapshot = await getDatabase().ref(`teams/${teamId}`).get();
  if (!snapshot.exists()) throw new HttpsError('permission-denied', GENERIC_AUTH_ERROR);
}

async function publishState(teamId, state, extra = {}) {
  await getDatabase().ref(`teamAccess/${teamId}`).set({ state, updatedAt: Date.now(), ...extra });
}

export const createTeamActivationCodes = onCall(callableOptions(), async request => {
  requireCommissioner(request);
  const database = getDatabase();
  const teams = (await database.ref('teams').get()).val() || {};
  const requestedIds = Array.isArray(request.data?.teamIds) ? request.data.teamIds : Object.keys(teams);
  const teamIds = [...new Set(requestedIds.map(normalizeTeamId))].filter(teamId => teams[teamId]);
  if (!teamIds.length) throw new HttpsError('failed-precondition', 'No teams are available for activation.');

  const now = Date.now();
  const pepper = teamAuthPepper.value();
  const updates = {};
  const activationCodes = [];

  for (const teamId of teamIds) {
    const existing = (await database.ref(`teamAuthPrivate/${teamId}`).get()).val() || {};
    if (existing.pinHash) continue;
    const activationCode = generateActivationCode();
    const accessVersion = Number(existing.accessVersion || 1);
    updates[`teamAuthPrivate/${teamId}`] = {
      state: 'unclaimed',
      activationCodeHash: activationCodeHash(teamId, activationCode, pepper),
      activationExpiresAt: now + ACTIVATION_LIFETIME_MS,
      accessVersion,
      failedAttempts: 0,
      lockUntil: null,
      updatedAt: now,
    };
    updates[`teamAccess/${teamId}`] = { state: 'unclaimed', updatedAt: now };
    activationCodes.push({ teamId, activationCode });
  }

  await database.ref().update(updates);
  return { activationCodes, expiresAt: now + ACTIVATION_LIFETIME_MS };
});

export const activateCommissioner = onCall(
  callableOptions([teamAuthPepper, commissionerSetupCode]),
  async request => {
    let setupCode;
    let pin;
    try {
      setupCode = normalizeActivationCode(request.data?.setupCode);
      pin = validatePin(request.data?.pin);
    } catch {
      throw new HttpsError('permission-denied', GENERIC_AUTH_ERROR);
    }

    const database = getDatabase();
    const privateRef = database.ref('commissionerAuthPrivate');
    const current = (await privateRef.get()).val() || {};
    if (current.state === 'claimed') throw new HttpsError('permission-denied', GENERIC_AUTH_ERROR);

    const pepper = teamAuthPepper.value();
    const suppliedHash = activationCodeHash('commissioner', setupCode, pepper);
    let expectedHash;
    try {
      expectedHash = activationCodeHash('commissioner', commissionerSetupCode.value(), pepper);
    } catch {
      throw new HttpsError('failed-precondition', 'Commissioner access is not configured.');
    }
    if (!secureHashEqual(suppliedHash, expectedHash)) {
      throw new HttpsError('permission-denied', GENERIC_AUTH_ERROR);
    }

    const now = Date.now();
    const pinRecord = await hashPin('commissioner', pin, pepper);
    const transaction = await privateRef.transaction(record => {
      const candidate = record || current;
      if (candidate?.state === 'claimed') return;
      return {
        state: 'claimed',
        pinSalt: pinRecord.salt,
        pinHash: pinRecord.hash,
        accessVersion: Number(candidate?.accessVersion || 1),
        failedAttempts: 0,
        lockUntil: null,
        claimedAt: now,
        updatedAt: now,
      };
    });
    if (!transaction.committed) throw new HttpsError('permission-denied', GENERIC_AUTH_ERROR);

    await database.ref('commissionerAccess').set({ state: 'claimed', updatedAt: now });
    const accessVersion = transaction.snapshot.val().accessVersion;
    return { customToken: await mintCommissionerToken(accessVersion), role: 'commissioner' };
  },
);

export const loginCommissioner = onCall(callableOptions(), async request => {
  let pin;
  try {
    pin = validatePin(request.data?.pin);
  } catch {
    throw new HttpsError('permission-denied', GENERIC_AUTH_ERROR);
  }

  const database = getDatabase();
  const privateRef = database.ref('commissionerAuthPrivate');
  const current = (await privateRef.get()).val();
  const now = Date.now();
  if (!current?.pinHash || !current?.pinSalt || (current.lockUntil && current.lockUntil > now)) {
    throw new HttpsError('permission-denied', GENERIC_AUTH_ERROR);
  }

  const valid = await verifyPin('commissioner', pin, teamAuthPepper.value(), current.pinSalt, current.pinHash);
  if (!valid) {
    const transaction = await privateRef.transaction(record => {
      const candidate = record || current;
      if (candidate.pinHash !== current.pinHash ||
          Number(candidate.accessVersion || 1) !== Number(current.accessVersion || 1) ||
          (candidate.lockUntil && candidate.lockUntil > now)) return;
      return { ...candidate, ...failedAttemptState(candidate, now), updatedAt: now };
    });
    if (transaction.snapshot.val()?.state === 'locked') {
      await database.ref('commissionerAccess').set({ state: 'locked', updatedAt: now });
    }
    throw new HttpsError('permission-denied', GENERIC_AUTH_ERROR);
  }

  const transaction = await privateRef.transaction(record => {
    const candidate = record || current;
    if (candidate.pinHash !== current.pinHash ||
        Number(candidate.accessVersion || 1) !== Number(current.accessVersion || 1) ||
        (candidate.lockUntil && candidate.lockUntil > now)) return;
    return { ...candidate, state: 'claimed', failedAttempts: 0, lockUntil: null, lastLoginAt: now, updatedAt: now };
  });
  if (!transaction.committed) throw new HttpsError('permission-denied', GENERIC_AUTH_ERROR);

  await database.ref('commissionerAccess').set({ state: 'claimed', updatedAt: now });
  const accessVersion = transaction.snapshot.val().accessVersion;
  return { customToken: await mintCommissionerToken(accessVersion), role: 'commissioner' };
});

export const activateTeam = onCall(callableOptions(), async request => {
  let teamId;
  let activationCode;
  let pin;
  try {
    teamId = normalizeTeamId(request.data?.teamId);
    activationCode = normalizeActivationCode(request.data?.activationCode);
    pin = validatePin(request.data?.pin);
  } catch {
    throw new HttpsError('permission-denied', GENERIC_AUTH_ERROR);
  }

  await ensureTeamExists(teamId);
  const database = getDatabase();
  const privateRef = database.ref(`teamAuthPrivate/${teamId}`);
  const current = (await privateRef.get()).val();
  const now = Date.now();
  const pepper = teamAuthPepper.value();
  const suppliedHash = activationCodeHash(teamId, activationCode, pepper);
  const activationMatches = current
    ? secureHashEqual(current.activationCodeHash, suppliedHash)
    : false;

  if (!current || !['unclaimed', 'reset-required'].includes(current.state) ||
      current.activationExpiresAt < now || !activationMatches) {
    throw new HttpsError('permission-denied', GENERIC_AUTH_ERROR);
  }

  const pinRecord = await hashPin(teamId, pin, pepper);
  const transaction = await privateRef.transaction(record => {
    const candidate = record || current;
    if (!['unclaimed', 'reset-required'].includes(candidate.state) ||
        candidate.activationExpiresAt < now || !secureHashEqual(candidate.activationCodeHash, suppliedHash)) return;
    return {
      state: 'claimed',
      pinSalt: pinRecord.salt,
      pinHash: pinRecord.hash,
      accessVersion: Number(candidate.accessVersion || 1),
      failedAttempts: 0,
      lockUntil: null,
      claimedAt: now,
      updatedAt: now,
    };
  });
  if (!transaction.committed) throw new HttpsError('permission-denied', GENERIC_AUTH_ERROR);

  const accessVersion = transaction.snapshot.val().accessVersion;
  await publishState(teamId, 'claimed', { claimedAt: now });
  return { customToken: await mintOwnerToken(teamId, accessVersion), teamId, state: 'claimed' };
});

export const loginTeam = onCall(callableOptions(), async request => {
  let teamId;
  let pin;
  try {
    teamId = normalizeTeamId(request.data?.teamId);
    pin = validatePin(request.data?.pin);
  } catch {
    throw new HttpsError('permission-denied', GENERIC_AUTH_ERROR);
  }

  await ensureTeamExists(teamId);
  const database = getDatabase();
  const privateRef = database.ref(`teamAuthPrivate/${teamId}`);
  const current = (await privateRef.get()).val();
  const now = Date.now();
  if (!current?.pinHash || !current?.pinSalt || (current.lockUntil && current.lockUntil > now)) {
    throw new HttpsError('permission-denied', GENERIC_AUTH_ERROR);
  }

  const valid = await verifyPin(teamId, pin, teamAuthPepper.value(), current.pinSalt, current.pinHash);
  if (!valid) {
    const transaction = await privateRef.transaction(record => {
      const candidate = record || current;
      if (candidate.pinHash !== current.pinHash ||
          Number(candidate.accessVersion || 1) !== Number(current.accessVersion || 1) ||
          (candidate.lockUntil && candidate.lockUntil > now)) return;
      return { ...candidate, ...failedAttemptState(candidate, now), updatedAt: now };
    });
    if (transaction.snapshot.val()?.state === 'locked') await publishState(teamId, 'locked');
    throw new HttpsError('permission-denied', GENERIC_AUTH_ERROR);
  }

  const transaction = await privateRef.transaction(record => {
    const candidate = record || current;
    if (candidate.pinHash !== current.pinHash ||
        Number(candidate.accessVersion || 1) !== Number(current.accessVersion || 1) ||
        (candidate.lockUntil && candidate.lockUntil > now)) return;
    return { ...candidate, state: 'claimed', failedAttempts: 0, lockUntil: null, lastLoginAt: now, updatedAt: now };
  });
  if (!transaction.committed) throw new HttpsError('permission-denied', GENERIC_AUTH_ERROR);

  const authenticatedRecord = transaction.snapshot.val();
  const accessVersion = Number(authenticatedRecord.accessVersion || 1);
  await publishState(teamId, 'claimed', { claimedAt: authenticatedRecord.claimedAt || now });
  return { customToken: await mintOwnerToken(teamId, accessVersion), teamId, state: 'claimed' };
});

export const resetTeamPin = onCall(callableOptions(), async request => {
  requireCommissioner(request);
  const teamId = normalizeTeamId(request.data?.teamId);
  await ensureTeamExists(teamId);
  const database = getDatabase();
  const privateRef = database.ref(`teamAuthPrivate/${teamId}`);
  const current = (await privateRef.get()).val() || {};
  const now = Date.now();
  const activationCode = generateActivationCode();
  const accessVersion = Number(current.accessVersion || 1) + 1;

  await privateRef.set({
    state: 'reset-required',
    activationCodeHash: activationCodeHash(teamId, activationCode, teamAuthPepper.value()),
    activationExpiresAt: now + ACTIVATION_LIFETIME_MS,
    accessVersion,
    failedAttempts: 0,
    lockUntil: null,
    updatedAt: now,
  });
  await publishState(teamId, 'reset-required');

  try {
    await getAuth().revokeRefreshTokens(`team:${teamId}`);
  } catch (error) {
    if (error.code !== 'auth/user-not-found') throw error;
  }

  return { teamId, activationCode, expiresAt: now + ACTIVATION_LIFETIME_MS };
});
