import { useState, useEffect } from 'react';
import { ref, onValue } from 'firebase/database';
import { db } from './firebase';
import SetupScreen from './screens/SetupScreen';
import LobbyScreen from './screens/LobbyScreen';
import DraftScreen from './screens/DraftScreen';
import './App.css';

export default function App() {
  const [draftStatus, setDraftStatus]     = useState(null);
  const [loading, setLoading]             = useState(true);
  const [firebaseError, setFirebaseError] = useState(false);

  // Lifted to state so selecting a team in LobbyScreen immediately re-routes
  const [selectedTeamId, setSelectedTeamId] = useState(
    () => localStorage.getItem('ff_selected_team')
  );

  function handleTeamSelect(teamId) {
    localStorage.setItem('ff_selected_team', teamId);
    setSelectedTeamId(teamId);
  }

  function handleTeamClear() {
    localStorage.removeItem('ff_selected_team');
    setSelectedTeamId(null);
  }

  useEffect(() => {
    const unsub = onValue(
      ref(db, 'draft/status'),
      (snapshot) => {
        setDraftStatus(snapshot.val());
        setLoading(false);
      },
      (error) => {
        console.error('Firebase connection error:', error);
        setFirebaseError(true);
        setLoading(false);
      }
    );
    return () => unsub();
  }, []);

  if (loading) {
    return (
      <div className="app-loading">
        <p>Connecting to database...</p>
      </div>
    );
  }

  if (firebaseError) {
    return (
      <div className="app-error">
        <h2>⚠️ Firebase Not Configured</h2>
        <p>Open <code>src/firebase.js</code> and paste in your Firebase config keys.</p>
      </div>
    );
  }

  // Route to the right screen based on draft status + selected team
  if (!draftStatus || draftStatus === 'setup') return <SetupScreen />;

  if (draftStatus === 'lobby') {
    return <LobbyScreen selectedTeamId={selectedTeamId} onTeamSelect={handleTeamSelect} />;
  }

  if (draftStatus === 'active' || draftStatus === 'paused') {
    if (!selectedTeamId) {
      return <LobbyScreen rejoin selectedTeamId={selectedTeamId} onTeamSelect={handleTeamSelect} />;
    }
    return <DraftScreen selectedTeamId={selectedTeamId} onTeamClear={handleTeamClear} />;
  }

  if (draftStatus === 'complete') {
    return <DraftScreen complete selectedTeamId={selectedTeamId} onTeamClear={handleTeamClear} />;
  }

  return <SetupScreen />;
}
