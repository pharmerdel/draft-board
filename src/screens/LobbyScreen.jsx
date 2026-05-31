import { useState, useEffect } from 'react';
import { ref, onValue, update, set, get } from 'firebase/database';
import { QRCodeSVG } from 'qrcode.react';
import { db } from '../firebase';
import './LobbyScreen.css';

const TEAM_COUNT = 12;

export default function LobbyScreen({ rejoin = false, selectedTeamId, onTeamSelect }) {
  const [teams, setTeams] = useState({});
  const [draft, setDraft] = useState({});
  const [starting, setStarting] = useState(false);
  const [confirmingStart, setConfirmingStart] = useState(false);

  const draftUrl = window.location.href;
  const connectedCount = Object.values(teams).filter(t => t.connected).length;

  // Live sync teams
  useEffect(() => {
    const unsub = onValue(ref(db, 'teams'), snap => setTeams(snap.val() || {}));
    return () => unsub();
  }, []);

  // Live sync draft info
  useEffect(() => {
    const unsub = onValue(ref(db, 'draft'), snap => setDraft(snap.val() || {}));
    return () => unsub();
  }, []);

  // Mark connected on mount, disconnected on leave
  useEffect(() => {
    if (!selectedTeamId || selectedTeamId === 'commissioner') return;
    update(ref(db, `teams/${selectedTeamId}`), { connected: true, lastSeen: Date.now() });
    const handleUnload = () => {
      update(ref(db, `teams/${selectedTeamId}`), { connected: false });
    };
    window.addEventListener('beforeunload', handleUnload);
    return () => {
      window.removeEventListener('beforeunload', handleUnload);
      update(ref(db, `teams/${selectedTeamId}`), { connected: false });
    };
  }, [selectedTeamId]);

  async function handleConfirmStart() {
    setStarting(true);
    setConfirmingStart(false);
    await update(ref(db, 'draft'), {
      status: 'active',
      startedAt: Date.now(),
      timerEnabled: false,
      timerDuration: 90,
      timerStartedAt: null,
    });
  }

  // ── TEAM SELECTION VIEW (lobby or mid-draft rejoin) ──────────────────────
  if (!selectedTeamId) {
    return (
      <div className="lobby-screen">
        <div className="lobby-header">
          <h1>🏈 {draft.leagueName || 'FF Auction Draft'}</h1>
          <p className="lobby-subtitle">
            {rejoin ? 'Select your team to join the draft' : 'Select your team to enter the lobby'}
          </p>
          {rejoin && <div className="rejoin-badge">🔴 Draft In Progress</div>}
        </div>

        {/* Commissioner button */}
        <button
          className="team-select-btn commissioner-btn"
          onClick={() => onTeamSelect('commissioner')}
          style={{ gridColumn: '1 / -1' }}
        >
          <span className="team-select-name">📋 Commissioner Board</span>
          <span className="team-select-owner">Full controls — nominations, bids, sold</span>
        </button>

        <div className="team-select-grid">
          {Object.entries(teams)
            .sort((a, b) => a[1].nominationOrder - b[1].nominationOrder)
            .map(([teamId, team]) => {
              const isActive = team.connected;
              const isTaken  = isActive && rejoin;

              return (
                <div key={teamId} className="team-select-card">
                  <button
                    className={`team-select-btn ${isTaken ? 'taken' : ''}`}
                    onClick={() => !isTaken && onTeamSelect(teamId)}
                    disabled={isTaken}
                  >
                    <span className="team-select-name">{team.name}</span>
                    <span className="team-select-owner">{team.ownerName}</span>
                    {isActive && (
                      <span className="team-select-badge">
                        {rejoin ? 'Active' : 'Joined'}
                      </span>
                    )}
                  </button>
                  {isTaken && rejoin && (
                    <button
                      className="rejoin-override-btn"
                      onClick={() => onTeamSelect(teamId)}
                    >
                      This is my team →
                    </button>
                  )}
                </div>
              );
            })}
        </div>
      </div>
    );
  }

  // ── WAITING ROOM VIEW ────────────────────────────────────────────────────
  const myTeam = teams[selectedTeamId];

  return (
    <div className="lobby-screen">
      {confirmingStart && (
        <div className="confirm-overlay">
          <div className="confirm-modal">
            <h2>Start the draft?</h2>
            <p>All connected participants will be moved to the draft board. Make sure everyone is ready.</p>
            <div className="confirm-buttons">
              <button className="confirm-cancel-btn" onClick={() => setConfirmingStart(false)}>
                Cancel
              </button>
              <button className="confirm-go-btn" onClick={handleConfirmStart} disabled={starting}>
                {starting ? 'Starting...' : 'Yes, start the draft'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="lobby-header">
        <h1>🏈 {draft.leagueName || 'FF Auction Draft'}</h1>
        <p className="lobby-subtitle">
          Joined as <strong>{myTeam?.name || selectedTeamId}</strong>
        </p>
      </div>

      <div className="lobby-body">
        {/* QR Code + URL */}
        <div className="lobby-qr-section">
          <QRCodeSVG value={draftUrl} size={200} bgColor="#ffffff" fgColor="#0f1117" level="M" />
          <p className="lobby-url">{draftUrl}</p>
          <p className="lobby-url-hint">Share this link with your league</p>
        </div>

        {/* Connected teams */}
        <div className="lobby-teams-section">
          <div className="lobby-connected-count">
            <span className="count-num">{connectedCount}</span>
            <span className="count-label"> of {TEAM_COUNT} connected</span>
          </div>

          <div className="lobby-team-list">
            {Object.entries(teams)
              .sort((a, b) => a[1].nominationOrder - b[1].nominationOrder)
              .map(([teamId, team]) => (
                <div
                  key={teamId}
                  className={`lobby-team-row ${team.connected ? 'connected' : ''} ${teamId === selectedTeamId ? 'mine' : ''}`}
                >
                  <span className={`status-dot ${team.connected ? 'on' : 'off'}`} />
                  <span className="lobby-team-name">{team.name}</span>
                  <span className="lobby-team-owner">{team.ownerName}</span>
                  {team.connected && <span className="lobby-joined-badge">✓ Joined</span>}
                </div>
              ))}
          </div>

          <button
            className="start-draft-btn"
            onClick={() => setConfirmingStart(true)}
            disabled={starting}
          >
            {starting ? 'Starting...' : '▶ Start Draft'}
          </button>
          <p className="start-hint">Everyone will move to the draft board simultaneously.</p>
        </div>
      </div>
    </div>
  );
}
