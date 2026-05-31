import { useState } from 'react';
import RosterModal from './RosterModal';
import './TeamsColumn.css';

const SLOT_LIMITS = { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 2, BN: 5 };
const TOTAL_DRAFT_SLOTS = 13; // IR excluded from draft

function maxBid(team) {
  const roster = Object.values(team.roster || {});
  const filled = roster.length;
  const empty  = Math.max(0, TOTAL_DRAFT_SLOTS - filled);
  return Math.max(1, (team.budgetRemaining || 0) - (empty - 1));
}

function slotsFilled(team) {
  return Object.values(team.roster || {}).length;
}

export default function TeamsColumn({ teams, draft, nominatingTeamId, selectedTeamId }) {
  const [modalTeamId, setModalTeamId] = useState(null);
  const nominationOrderIds = draft.nominationOrderIds || [];

  return (
    <div className="teams-col">
      <h2 className="col-heading">Teams <span className="col-heading-hint">— click to view roster</span></h2>
      <div className="teams-list">
        {nominationOrderIds.map((teamId, idx) => {
          const team = teams[teamId];
          if (!team) return null;
          const isNominating = teamId === nominatingTeamId;
          const isMe = teamId === selectedTeamId;
          const filled = slotsFilled(team);
          const max = maxBid(team);

          return (
            <div
              key={teamId}
              className={`team-card clickable ${isNominating ? 'nominating' : ''} ${isMe ? 'my-team' : ''}`}
              onClick={() => setModalTeamId(teamId)}
              title="Click to view full roster"
            >
              <div className="team-card-top">
                <span className="nom-order">{idx + 1}</span>
                <div className="team-card-names">
                  <span className="team-card-name">{team.name}</span>
                  <span className="team-card-owner">{team.ownerName}</span>
                </div>
                {isNominating && <span className="nominating-badge">NOMINATING</span>}
                {team.connected && <span className="connected-dot" title="Connected" />}
              </div>

              <div className="team-card-stats">
                <div className="stat">
                  <span className="stat-label">Budget</span>
                  <span className="stat-value budget">${team.budgetRemaining ?? 200}</span>
                </div>
                <div className="stat">
                  <span className="stat-label">Roster</span>
                  <span className="stat-value">{filled}/{TOTAL_DRAFT_SLOTS}</span>
                </div>
                <div className="stat">
                  <span className="stat-label">Max Bid</span>
                  <span className="stat-value max-bid">${max}</span>
                </div>
              </div>

              {/* Roster slot pills */}
              <div className="slot-pills">
                {Object.entries(SLOT_LIMITS).map(([slot, limit]) => {
                  const filledCount = Object.values(team.roster || {}).filter(p => p.slotType === slot).length;
                  return Array.from({ length: limit }, (_, i) => (
                    <span
                      key={`${slot}${i}`}
                      className={`slot-pill ${i < filledCount ? 'filled' : 'empty'}`}
                      title={slot}
                    >
                      {slot}
                    </span>
                  ));
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Roster modal */}
      {modalTeamId && (
        <RosterModal
          team={teams[modalTeamId]}
          teamId={modalTeamId}
          onClose={() => setModalTeamId(null)}
        />
      )}
    </div>
  );
}
