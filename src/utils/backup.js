// Draft backup and restore utilities.
// Backup is saved to localStorage automatically after every pick.
// The commissioner can download it as a JSON file at any time.
// Restoring from that file re-writes the full state to Firebase.

const BACKUP_KEY = 'ff_draft_backup';

// ── Save ─────────────────────────────────────────────────────────────────────

export function saveBackup({ draft, teams, players, log }) {
  const snapshot = {
    savedAt: Date.now(),
    pickCount: Object.values(log || {}).filter(e => e.type === 'sold').length,
    draft,
    teams,
    players,
    log: log || {},
  };
  try {
    localStorage.setItem(BACKUP_KEY, JSON.stringify(snapshot));
  } catch (err) {
    console.warn('Backup save failed (localStorage full?):', err);
  }
  return snapshot;
}

// ── Load from localStorage ────────────────────────────────────────────────────

export function loadBackup() {
  try {
    const raw = localStorage.getItem(BACKUP_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// ── Download as JSON file ─────────────────────────────────────────────────────

export function downloadBackup() {
  const snapshot = loadBackup();
  if (!snapshot) {
    alert('No backup found in this browser. Has a pick been made yet?');
    return;
  }
  const json = JSON.stringify(snapshot, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const date = new Date(snapshot.savedAt)
    .toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: '2-digit' })
    .replace(/\//g, '-');
  link.href     = url;
  link.download = `draft-backup-${snapshot.pickCount}-picks-${date}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// ── Parse an uploaded backup file ────────────────────────────────────────────

export function parseBackupFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const snapshot = JSON.parse(e.target.result);
        // Basic validation
        if (!snapshot.draft || !snapshot.teams || !snapshot.players) {
          reject(new Error('Invalid backup file — missing required fields.'));
          return;
        }
        resolve(snapshot);
      } catch {
        reject(new Error('Could not read file. Make sure it is a valid backup JSON.'));
      }
    };
    reader.onerror = () => reject(new Error('File read error.'));
    reader.readAsText(file);
  });
}
