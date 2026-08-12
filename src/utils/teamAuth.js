import {
  browserLocalPersistence,
  getIdTokenResult,
  setPersistence,
  signInWithCustomToken,
  signOut,
} from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';

import { auth, functions } from '../firebase';

const activateTeam = httpsCallable(functions, 'activateTeam');
const loginTeam = httpsCallable(functions, 'loginTeam');
const activateCommissioner = httpsCallable(functions, 'activateCommissioner');
const loginCommissioner = httpsCallable(functions, 'loginCommissioner');
const createTeamActivationCodes = httpsCallable(functions, 'createTeamActivationCodes');
const resetTeamPinCallable = httpsCallable(functions, 'resetTeamPin');

export async function authenticateTeam({ teamId, accessState, activationCode, pin }) {
  await setPersistence(auth, browserLocalPersistence);
  const callable = ['unclaimed', 'reset-required'].includes(accessState) ? activateTeam : loginTeam;
  const payload = { teamId, pin };
  if (callable === activateTeam) payload.activationCode = activationCode;

  const result = await callable(payload);
  const credential = await signInWithCustomToken(auth, result.data.customToken);
  const token = await getIdTokenResult(credential.user, true);

  if (token.claims.role !== 'owner' || token.claims.teamId !== teamId) {
    await signOut(auth);
    throw new Error('The authenticated team did not match the selected team.');
  }

  return teamId;
}

export function signOutTeam() {
  return signOut(auth);
}

export async function authenticateCommissioner({ accessState, setupCode, pin }) {
  await setPersistence(auth, browserLocalPersistence);
  const activating = accessState === 'unclaimed';
  const result = await (activating ? activateCommissioner({ setupCode, pin }) : loginCommissioner({ pin }));
  const credential = await signInWithCustomToken(auth, result.data.customToken);
  const token = await getIdTokenResult(credential.user, true);

  if (token.claims.role !== 'commissioner') {
    await signOut(auth);
    throw new Error('The authenticated account is not the commissioner.');
  }

  return 'commissioner';
}

export async function generateTeamActivationCodes(teamIds) {
  const result = await createTeamActivationCodes(teamIds ? { teamIds } : {});
  return result.data;
}

export async function resetTeamPin(teamId) {
  const result = await resetTeamPinCallable({ teamId });
  return result.data;
}
