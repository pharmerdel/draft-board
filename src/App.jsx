import { useState, useEffect } from 'react';
import { getIdTokenResult, onAuthStateChanged } from 'firebase/auth';
import { ref, onValue } from 'firebase/database';
import { auth, db } from './firebase';
import SetupScreen from './screens/SetupScreen';
import LobbyScreen from './screens/LobbyScreen';
import DraftScreen from './screens/DraftScreen';
import AccessGate from './components/AccessGate';
import ThemeToggle from './components/ThemeToggle';
import { hasLeagueAccess } from './utils/accessGateStorage';
import { signOutTeam } from './utils/teamAuth';
import './App.css';

export default function App() {
  const setupPreview = import.meta.env.DEV && new URLSearchParams(window.location.search).get('view') === 'setup';
  const [draftStatus, setDraftStatus]     = useState(null);
  const [loading, setLoading]             = useState(true);
  const [firebaseError, setFirebaseError] = useState(false);
  const [accessGranted, setAccessGranted] = useState(() => hasLeagueAccess());
  const [theme, setTheme] = useState(
    () => localStorage.getItem('ff_theme') || 'light'
  );

  const [authReady, setAuthReady] = useState(false);
  const [selectedTeamId, setSelectedTeamId] = useState(null);

  function handleTeamSelect(teamId) {
    setSelectedTeamId(teamId);
  }

  async function handleTeamClear() {
    await signOutTeam();
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
    const unsubscribe = onAuthStateChanged(auth, async user => {
      if (!user) {
        setSelectedTeamId(null);
        setAuthReady(true);
        return;
      }

      try {
        const token = await getIdTokenResult(user);
        if (token.claims.role === 'owner' && typeof token.claims.teamId === 'string') {
          localStorage.removeItem('ff_selected_team');
          setSelectedTeamId(token.claims.teamId);
        } else if (token.claims.role === 'commissioner') {
          setSelectedTeamId('commissioner');
        } else {
          await signOutTeam();
        }
      } catch (error) {
        console.error('Unable to restore team session:', error);
        setSelectedTeamId(null);
      } finally {
        setAuthReady(true);
      }
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!accessGranted) return undefined;

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
  }, [accessGranted]);

  if (!accessGranted) {
    return (
      <>
        <ThemeToggle theme={theme} onToggle={toggleTheme} className="corner" />
        <AccessGate onUnlock={() => setAccessGranted(true)} />
      </>
    );
  }

  if (loading || !authReady) {
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

  // Read-only navigation aid for local setup-screen verification while a live draft exists.
  if (setupPreview) {
    return (
      <>
        <ThemeToggle theme={theme} onToggle={toggleTheme} className="corner" />
        <SetupScreen />
      </>
    );
  }

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
        <LobbyScreen selectedTeamId={selectedTeamId} onTeamSelect={handleTeamSelect} onTeamClear={handleTeamClear} />
      </>
    );
  }

  if (draftStatus === 'active' || draftStatus === 'paused') {
    if (!selectedTeamId) {
      return (
        <>
          <ThemeToggle theme={theme} onToggle={toggleTheme} className="corner" />
          <LobbyScreen rejoin selectedTeamId={selectedTeamId} onTeamSelect={handleTeamSelect} onTeamClear={handleTeamClear} />
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
