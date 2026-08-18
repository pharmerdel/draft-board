import { getApp, getApps, initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth } from 'firebase/auth';
import { connectDatabaseEmulator, getDatabase } from 'firebase/database';
import { connectFunctionsEmulator, getFunctions } from 'firebase/functions';

const defaultFirebaseConfig = {
  apiKey: 'AIzaSyAjq2vu46yDB8ipYdlflRdPoWU_mwDhRyA',
  authDomain: 'ff-draft-board.firebaseapp.com',
  databaseURL: 'https://ff-draft-board-default-rtdb.firebaseio.com',
  projectId: 'ff-draft-board',
  storageBucket: 'ff-draft-board.firebasestorage.app',
  messagingSenderId: '773564028900',
  appId: '1:773564028900:web:29b13399f07700942859f1',
};

const useFirebaseEmulators = import.meta.env.DEV
  && import.meta.env.VITE_USE_FIREBASE_EMULATORS === 'true';
const allowRemoteFirebaseInDevelopment = import.meta.env.DEV
  && import.meta.env.VITE_ALLOW_REMOTE_FIREBASE === 'true';

if (import.meta.env.DEV && !useFirebaseEmulators && !allowRemoteFirebaseInDevelopment) {
  throw new Error(
    'Firebase is fail-closed in development. Use npm run dev for local emulators or npm run dev:remote for an explicitly configured remote development project.',
  );
}

const emulatorProjectId = import.meta.env.VITE_FIREBASE_PROJECT_ID || 'demo-draft-board-local';

const firebaseConfig = useFirebaseEmulators
  ? {
      apiKey: 'demo-api-key',
      authDomain: `${emulatorProjectId}.firebaseapp.com`,
      databaseURL: `https://${emulatorProjectId}.firebaseio.com`,
      projectId: emulatorProjectId,
      storageBucket: `${emulatorProjectId}.firebasestorage.app`,
      messagingSenderId: '000000000000',
      appId: '1:000000000000:web:local',
    }
  : {
      apiKey:            import.meta.env.VITE_FIREBASE_API_KEY             || defaultFirebaseConfig.apiKey,
      authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN         || defaultFirebaseConfig.authDomain,
      databaseURL:       import.meta.env.VITE_FIREBASE_DATABASE_URL        || defaultFirebaseConfig.databaseURL,
      projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID          || defaultFirebaseConfig.projectId,
      storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET      || defaultFirebaseConfig.storageBucket,
      messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || defaultFirebaseConfig.messagingSenderId,
      appId:             import.meta.env.VITE_FIREBASE_APP_ID              || defaultFirebaseConfig.appId,
    };

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const db = getDatabase(app);
export const auth = getAuth(app);
export const functions = getFunctions(app, 'us-central1');

if (useFirebaseEmulators && !globalThis.__draftBoardFirebaseEmulatorsConnected) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectDatabaseEmulator(db, '127.0.0.1', 9000);
  connectFunctionsEmulator(functions, '127.0.0.1', 5001);
  globalThis.__draftBoardFirebaseEmulatorsConnected = true;
}

export const firebaseRuntime = Object.freeze({
  projectId: firebaseConfig.projectId,
  usingEmulators: useFirebaseEmulators,
});
