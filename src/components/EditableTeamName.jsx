import { useEffect, useRef, useState } from 'react';
import { ref, set } from 'firebase/database';
import { Pencil, X } from 'lucide-react';

import { db } from '../firebase';
import { MAX_TEAM_NAME_LENGTH, normalizeTeamName, validateTeamName } from '../utils/teamName';
import './EditableTeamName.css';

export default function EditableTeamName({ teamId, name, className = '', disabled = false }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(name || '');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const handleKeyDown = event => {
      if (event.key === 'Escape' && !saving) setOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, saving]);

  function openEditor() {
    setValue(name || '');
    setError('');
    setOpen(true);
    window.setTimeout(() => inputRef.current?.select(), 0);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const validationError = validateTeamName(value);
    if (validationError) {
      setError(validationError);
      return;
    }

    const normalized = normalizeTeamName(value);
    if (normalized === name) {
      setOpen(false);
      return;
    }

    setSaving(true);
    setError('');
    try {
      await set(ref(db, `teams/${teamId}/name`), normalized);
      setOpen(false);
    } catch (saveError) {
      console.error('Unable to rename team:', saveError);
      setError('Could not save the team name. Check your connection and try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <span className={`editable-team-name ${className}`.trim()}>
        <span className="editable-team-name-text">{name || 'Team'}</span>
        {!disabled && (
          <button
            type="button"
            className="editable-team-name-trigger"
            onClick={openEditor}
            aria-label={`Edit team name${name ? ` for ${name}` : ''}`}
            title="Edit team name"
          >
            <Pencil size={14} strokeWidth={2.2} />
          </button>
        )}
      </span>

      {open && (
        <div className="team-name-editor-overlay" role="presentation" onMouseDown={() => !saving && setOpen(false)}>
          <div
            className="team-name-editor-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="team-name-editor-title"
            onMouseDown={event => event.stopPropagation()}
          >
            <div className="team-name-editor-header">
              <div>
                <p>Team settings</p>
                <h2 id="team-name-editor-title">Edit team name</h2>
              </div>
              <button type="button" onClick={() => setOpen(false)} disabled={saving} aria-label="Close team name editor">
                <X size={19} />
              </button>
            </div>
            <form onSubmit={handleSubmit}>
              <label htmlFor="team-name-editor-input">Team name</label>
              <input
                ref={inputRef}
                id="team-name-editor-input"
                type="text"
                value={value}
                maxLength={MAX_TEAM_NAME_LENGTH}
                onChange={event => {
                  setValue(event.target.value);
                  if (error) setError('');
                }}
                disabled={saving}
                aria-describedby="team-name-editor-help team-name-editor-error"
              />
              <div className="team-name-editor-meta">
                <span id="team-name-editor-help">This updates for everyone immediately.</span>
                <span>{value.length}/{MAX_TEAM_NAME_LENGTH}</span>
              </div>
              <p id="team-name-editor-error" className="team-name-editor-error" role="alert">{error}</p>
              <div className="team-name-editor-actions">
                <button type="button" className="secondary" onClick={() => setOpen(false)} disabled={saving}>Cancel</button>
                <button type="submit" className="primary" disabled={saving}>{saving ? 'Saving…' : 'Save name'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
