import { useState } from 'react';
import { ref, remove } from 'firebase/database';
import { db } from '../firebase';

export default function ResetButton({ compact = false, onTeamClear }) {
  const [confirming, setConfirming] = useState(false);
  const [resetting, setResetting]   = useState(false);

  async function handleReset() {
    setResetting(true);
    await remove(ref(db, 'draft'));
    await remove(ref(db, 'teams'));
    await remove(ref(db, 'players'));
    await remove(ref(db, 'log'));
    localStorage.removeItem('ff_selected_team');
    localStorage.removeItem('ff_draft_backup');
    if (onTeamClear) onTeamClear();
  }

  if (!confirming) {
    return (
      <button
        onClick={() => setConfirming(true)}
        style={{
          background: 'transparent',
          border: '1px solid #7f1d1d',
          color: '#fca5a5',
          borderRadius: '6px',
          padding: compact ? '3px 10px' : '0.5rem 1rem',
          fontSize: compact ? '0.75rem' : '0.85rem',
          cursor: 'pointer',
          fontWeight: 600,
        }}
      >
        🗑 Reset
      </button>
    );
  }

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
      <span style={{ color: '#fca5a5', fontSize: '0.8rem' }}>Reset everything?</span>
      <button
        onClick={() => setConfirming(false)}
        style={{ background: '#2e3348', color: '#aaa', border: 'none', borderRadius: '6px', padding: '3px 10px', cursor: 'pointer', fontSize: '0.8rem' }}
      >Cancel</button>
      <button
        onClick={handleReset}
        disabled={resetting}
        style={{ background: '#991b1b', color: '#fff', border: 'none', borderRadius: '6px', padding: '3px 10px', cursor: 'pointer', fontWeight: 700, fontSize: '0.8rem' }}
      >{resetting ? '…' : 'Yes'}</button>
    </span>
  );
}
