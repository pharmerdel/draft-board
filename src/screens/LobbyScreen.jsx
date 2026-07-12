import { useState, useEffect } from 'react';
import { ref, onValue, update } from 'firebase/database';
import { QRCodeSVG } from 'qrcode.react';
import {
  ArrowRight,
  MonitorUp,
  Play,
  QrCode,
  UsersRound,
} from 'lucide-react';
import { db } from '../firebase';
import './LobbyScreen.css';

const TEAM_COUNT = 12;

export default function LobbyScreen({ rejoin = false, selectedTeamId, onTeamSelect }) {
  const [teams, setTeams] = useState({});
  const [draft, setDraft] = useState({});
  const [starting, setStarting] = useState(false);
  const [confirmingStart, setConfirmingStart] = useState(false);

  const draftUrl = window.location.href;
  const teamEntries = Object.entries(teams)
    .filter(([, team]) => team?.name || team?.ownerName || team?.nominationOrder)
    .sort((a, b) => (a[1].nominationOrder || 999) - (b[1].nominationOrder || 999));
  const connectedCount = teamEntries.filter(([, t]) => t.connected).length;

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
        <div className="lobby-hero">
          <div>
            <p className="lobby-kicker">Draft Room</p>
            <h1>{draft.leagueName || 'FF Auction Draft'}</h1>
            <p className="lobby-subtitle">
              {rejoin ? 'Choose your team to rejoin the live draft.' : 'Choose your team or open the commissioner board.'}
            </p>
          </div>
          <div className={`lobby-state-pill ${rejoin ? 'live' : 'lobby'}`}>
            <span className="lobby-state-dot" />
            {rejoin ? 'Draft in progress' : 'Lobby'}
          </div>
        </div>

        <div className="entry-layout">
          <button
            className="commissioner-access"
            onClick={() => onTeamSelect('commissioner')}
          >
            <span className="commissioner-icon">
              <MonitorUp size={22} strokeWidth={2.2} />
            </span>
            <span className="commissioner-copy">
              <span className="commissioner-title">Commissioner Board</span>
              <span className="commissioner-subtitle">Nominations, winning bids, undo, export</span>
            </span>
            <ArrowRight className="commissioner-arrow" size={18} strokeWidth={2.2} />
          </button>

          <section className="owner-entry-panel">
            <div className="entry-section-header">
              <div>
                <p className="entry-section-title">Owner Access</p>
                <p className="entry-section-subtitle">{TEAM_COUNT} fixed league teams</p>
              </div>
              <span className="entry-connected-chip">
                <UsersRound size={15} strokeWidth={2.2} />
                {connectedCount}/{TEAM_COUNT}
              </span>
            </div>

            <div className="team-select-list">
              {teamEntries
                .map(([teamId, team]) => {
                  const isActive = team.connected;

                  return (
                    <div key={teamId} className="team-select-card">
                      <span className="team-select-order">{team.nominationOrder || '-'}</span>
                      <button
                        className={`team-select-btn ${isActive ? 'active' : ''}`}
                        onClick={() => onTeamSelect(teamId)}
                      >
                        <span className="team-select-copy">
                          <span className="team-select-name">{team.name}</span>
                          <span className="team-select-owner">{team.ownerName}</span>
                        </span>
                        {isActive && (
                          <span className="team-select-badge">
                            {rejoin ? 'Rejoin' : 'Joined'}
                          </span>
                        )}
                        <ArrowRight className="team-select-arrow" size={16} strokeWidth={2.2} />
                      </button>
                    </div>
                  );
                })}
            </div>
          </section>
        </div>
      </div>
    );
  }

  // ── WAITING ROOM VIEW ────────────────────────────────────────────────────
  const myTeam = teams[selectedTeamId];

  return (
    <div className="lobby-screen waiting-room">
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

      <div className="lobby-hero">
        <div>
          <p className="lobby-kicker">Waiting Room</p>
          <h1>{draft.leagueName || 'FF Auction Draft'}</h1>
          <p className="lobby-subtitle">
            Joined as <strong>{myTeam?.name || selectedTeamId}</strong>
          </p>
        </div>
        <div className="lobby-state-pill lobby">
          <span className="lobby-state-dot" />
          {connectedCount}/{TEAM_COUNT} connected
        </div>
      </div>

      <div className="lobby-body">
        {/* QR Code + URL */}
        <div className="lobby-qr-section">
          <div className="lobby-panel-header">
            <QrCode size={18} strokeWidth={2.2} />
            <span>Share Link</span>
          </div>
          <div className="qr-frame">
            <QRCodeSVG value={draftUrl} size={190} bgColor="#ffffff" fgColor="#111827" level="M" />
          </div>
          <p className="lobby-url">{draftUrl}</p>
          <p className="lobby-url-hint">Open this URL on each owner device.</p>
        </div>

        {/* Connected teams */}
        <div className="lobby-teams-section">
          <div className="lobby-panel-header">
            <UsersRound size={18} strokeWidth={2.2} />
            <span>Owners</span>
            <span className="lobby-connected-count">
              <span className="count-num">{connectedCount}</span>
              <span className="count-label">/{TEAM_COUNT}</span>
            </span>
          </div>

          <div className="lobby-team-list">
            {teamEntries
              .map(([teamId, team]) => (
                <div
                  key={teamId}
                  className={`lobby-team-row ${team.connected ? 'connected' : ''} ${teamId === selectedTeamId ? 'mine' : ''}`}
                >
                  <span className="lobby-team-order">{team.nominationOrder}</span>
                  <span className={`status-dot ${team.connected ? 'on' : 'off'}`} />
                  <span className="lobby-team-name">{team.name}</span>
                  <span className="lobby-team-owner">{team.ownerName}</span>
                  {team.connected && <span className="lobby-joined-badge">Joined</span>}
                </div>
              ))}
          </div>

          <button
            className="start-draft-btn"
            onClick={() => setConfirmingStart(true)}
            disabled={starting}
          >
            <Play size={18} fill="currentColor" strokeWidth={2.2} />
            {starting ? 'Starting...' : 'Start Draft'}
          </button>
          <p className="start-hint">Everyone will move to the draft board simultaneously.</p>
        </div>
      </div>
    </div>
  );
}
