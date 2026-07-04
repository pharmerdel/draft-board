import { initializeApp } from 'firebase/app';
import { getDatabase } from 'firebase/database';

const defaultFirebaseConfig = {
  apiKey: 'AIzaSyAjq2vu46yDB8ipYdlflRdPoWU_mwDhRyA',
  authDomain: 'ff-draft-board.firebaseapp.com',
  databaseURL: 'https://ff-draft-board-default-rtdb.firebaseio.com',
  projectId: 'ff-draft-board',
  storageBucket: 'ff-draft-board.firebasestorage.app',
  messagingSenderId: '773564028900',
  appId: '1:773564028900:web:29b13399f07700942859f1',
};

const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY            || defaultFirebaseConfig.apiKey,
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN        || defaultFirebaseConfig.authDomain,
  databaseURL:       import.meta.env.VITE_FIREBASE_DATABASE_URL       || defaultFirebaseConfig.databaseURL,
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID         || defaultFirebaseConfig.projectId,
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET     || defaultFirebaseConfig.storageBucket,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || defaultFirebaseConfig.messagingSenderId,
  appId:             import.meta.env.VITE_FIREBASE_APP_ID             || defaultFirebaseConfig.appId,
};

const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);
