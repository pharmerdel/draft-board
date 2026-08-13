import { useRef, useState } from 'react';
import { AlertTriangle, Download, FileUp, Upload, X } from 'lucide-react';

import { downloadCsv } from '../utils/exportCsv';
import {
  analyzeOwnerRankCsv,
  generateOwnerPlayerCatalogCsv,
  generateOwnerRankTemplateCsv,
} from '../utils/ownerRankImport';
import './OwnerRankImportModal.css';

export default function OwnerRankImportModal({ players, personalRanks, onClose, onImport }) {
  const inputRef = useRef(null);
  const [fileName, setFileName] = useState('');
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState('');
  const [importing, setImporting] = useState(false);
  const [includeNotes, setIncludeNotes] = useState(true);

  async function selectFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setError('');
    setPreview(null);
    setFileName(file.name);
    if (file.size > 2_000_000) {
      setError('That file is larger than 2 MB. Please upload only the rankings CSV.');
      return;
    }
    try {
      setPreview(analyzeOwnerRankCsv(await file.text(), players, personalRanks));
    } catch (readError) {
      setError(readError.message || 'We could not read that CSV.');
    }
  }

  async function confirmImport() {
    if (!preview?.matched.length || importing) return;
    setImporting(true);
    setError('');
    try {
      await onImport(preview.ranks, includeNotes ? preview.notes : null);
      onClose();
    } catch (importError) {
      setError(importError.message || 'The rankings could not be saved. Nothing was changed.');
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="rank-import-overlay" role="presentation" onMouseDown={event => event.target === event.currentTarget && onClose()}>
      <section className="rank-import-modal" role="dialog" aria-modal="true" aria-labelledby="rank-import-title">
        <header>
          <div>
            <p>Private rankings</p>
            <h2 id="rank-import-title">Import rankings CSV</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close rankings import"><X size={20} /></button>
        </header>

        <div className="rank-import-body">
          <p className="rank-import-intro">
            Required headers are <strong>Rank</strong> and <strong>Player</strong>. Include <strong>Position</strong> and <strong>Team</strong> for the safest matching. <strong>Notes</strong> is optional.
          </p>
          <code>Rank,Player,Position,Team,Notes</code>

          <div className="rank-import-downloads">
            <button type="button" onClick={() => downloadCsv(generateOwnerRankTemplateCsv(), 'rankings-template.csv')}>
              <Download size={16} /> Blank template
            </button>
            <button type="button" onClick={() => downloadCsv(generateOwnerPlayerCatalogCsv(players), 'draft-board-player-catalog.csv')}>
              <Download size={16} /> Player catalog
            </button>
          </div>

          <div className="rank-import-ai-note">
            Give the catalog, this header, and your analyst’s list to ChatGPT or Claude. Ask it to return only a CSV in your preferred order, without adding players.
          </div>

          <input ref={inputRef} type="file" accept=".csv,text/csv" onChange={selectFile} hidden />
          <button className="rank-import-file" type="button" onClick={() => inputRef.current?.click()}>
            <FileUp size={22} />
            <span><strong>{fileName || 'Choose rankings CSV'}</strong><small>The file is checked locally before anything is saved.</small></span>
          </button>

          {error && <div className="rank-import-error" role="alert"><AlertTriangle size={17} /> {error}</div>}

          {preview && (
            <div className="rank-import-preview">
              <div className="rank-import-summary">
                <article><strong>{preview.matched.length}</strong><span>Matched</span></article>
                <article><strong>{preview.issues.length}</strong><span>Need review</span></article>
                <article><strong>{preview.appendedCount}</strong><span>Appended</span></article>
              </div>

              {preview.hasNotesColumn && (
                <label className="rank-import-notes-option">
                  <input type="checkbox" checked={includeNotes} onChange={event => setIncludeNotes(event.target.checked)} />
                  <span><strong>Import {preview.notesCount} player note{preview.notesCount === 1 ? '' : 's'}</strong><small>Blank Notes cells will not erase anything you already saved.</small></span>
                </label>
              )}

              {preview.matched.length > 0 && (
                <div className="rank-import-matches">
                  <h3>Imported order</h3>
                  {preview.matched.slice(0, 8).map(entry => (
                    <div key={entry.playerId}><span>{entry.rank}</span><strong>{entry.player.name}</strong><small>{entry.player.position} · {entry.player.nflTeam}</small></div>
                  ))}
                  {preview.matched.length > 8 && <p>+ {preview.matched.length - 8} more matched players</p>}
                </div>
              )}

              {preview.issues.length > 0 && (
                <div className="rank-import-issues">
                  <h3>Rows that will be skipped</h3>
                  {preview.issues.slice(0, 10).map(issue => (
                    <div key={`${issue.row}-${issue.playerName}`}><strong>Row {issue.row}: {issue.playerName}</strong><span>{issue.reason}</span></div>
                  ))}
                  {preview.issues.length > 10 && <p>+ {preview.issues.length - 10} more issues</p>}
                </div>
              )}

              <p className="rank-import-footnote">
                Unlisted players will follow in their current relative order. Stars and tiers will not change.
              </p>
            </div>
          )}
        </div>

        <footer>
          <button type="button" onClick={onClose}>Cancel</button>
          <button className="rank-import-confirm" type="button" disabled={!preview?.matched.length || importing} onClick={confirmImport}>
            <Upload size={16} /> {importing ? 'Importing…' : includeNotes && preview?.notesCount ? 'Import order & notes' : 'Use this order'}
          </button>
        </footer>
      </section>
    </div>
  );
}
