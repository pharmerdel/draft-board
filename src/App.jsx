import { useState, useEffect } from 'react';
import { ref, onValue } from 'firebase/database';
import { db } from './firebase';
import SetupScreen from './screens/SetupScreen';
import LobbyScreen from './screens/LobbyScreen';
import DraftScreen from './screens/DraftScreen';
import ThemeToggle from './components/ThemeToggle';
import './App.css';

export default function App() {
  const [draftStatus, setDraftStatus]     = useState(null);
  const [loading, setLoading]             = useState(true);
  const [firebaseError, setFirebaseError] = useState(false);
  const [theme, setTheme] = useState(
    () => localStorage.getItem('ff_theme') || 'light'
  );

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

  function toggleTheme() {
    setTheme(current => {
      const next = current === 'dark' ? 'light' : 'dark';
      localStorage.setItem('ff_theme', next);
      return next;
    });
  }

  useEffect(() => {
    document.body.dataset.theme = theme;
    document.documentElement.dataset.theme = theme;
  }, [theme]);

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
      <>
        <ThemeToggle theme={theme} onToggle={toggleTheme} className="corner" />
        <div className="app-loading">
          <p>Connecting to database...</p>
        </div>
      </>
    );
  }

  if (firebaseError) {
    return (
      <>
        <ThemeToggle theme={theme} onToggle={toggleTheme} className="corner" />
        <div className="app-error">
          <h2>Firebase Not Configured</h2>
          <p>Open <code>src/firebase.js</code> and paste in your Firebase config keys.</p>
        </div>
      </>
    );
  }

  // Route to the right screen based on draft status + selected team
  const themeToggle = <ThemeToggle theme={theme} onToggle={toggleTheme} />;

  if (!draftStatus || draftStatus === 'setup') {
    return (
      <>
        <ThemeToggle theme={theme} onToggle={toggleTheme} className="corner" />
        <SetupScreen />
      </>
    );
  }

  if (draftStatus === 'lobby') {
    return (
      <>
        <ThemeToggle theme={theme} onToggle={toggleTheme} className="corner" />
        <LobbyScreen selectedTeamId={selectedTeamId} onTeamSelect={handleTeamSelect} />
      </>
    );
  }

  if (draftStatus === 'active' || draftStatus === 'paused') {
    if (!selectedTeamId) {
      return (
        <>
          <ThemeToggle theme={theme} onToggle={toggleTheme} className="corner" />
          <LobbyScreen rejoin selectedTeamId={selectedTeamId} onTeamSelect={handleTeamSelect} />
        </>
      );
    }
    return <DraftScreen selectedTeamId={selectedTeamId} onTeamClear={handleTeamClear} themeToggle={themeToggle} />;
  }

  if (draftStatus === 'complete') {
    return <DraftScreen complete selectedTeamId={selectedTeamId} onTeamClear={handleTeamClear} themeToggle={themeToggle} />;
  }

  return (
    <>
      <ThemeToggle theme={theme} onToggle={toggleTheme} className="corner" />
      <SetupScreen />
    </>
  );
}
