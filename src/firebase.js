import { initializeApp } from 'firebase/app';
import { getDatabase } from 'firebase/database';

const firebaseConfig = {
  apiKey: "AIzaSyAjq2vu46yDB8ipYdlflRdPoWU_mwDhRyA",
  authDomain: "ff-draft-board.firebaseapp.com",
  databaseURL: "https://ff-draft-board-default-rtdb.firebaseio.com",
  projectId: "ff-draft-board",
  storageBucket: "ff-draft-board.firebasestorage.app",
  messagingSenderId: "773564028900",
  appId: "1:773564028900:web:29b13399f07700942859f1"
};

const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);