import { useState } from 'react';
import RosterModal from './RosterModal';
import { SLOT_LIMITS, TOTAL_DRAFT_SLOTS, maxBidDisplay, rosterSize } from '../utils/rosterRules';
import './TeamsColumn.css';

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
          const filled = rosterSize(team);

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
                <div className="stat stat-budget">
                  <span className="stat-label">Budget</span>
                  <span className="stat-value budget">${team.budgetRemaining ?? 200}</span>
                </div>
                <div className="stat stat-roster">
                  <span className="stat-label">Roster</span>
                  <span className="stat-value">{filled}/{TOTAL_DRAFT_SLOTS}</span>
                </div>
                <div className="stat stat-max">
                  <span className="stat-label">Max Bid</span>
                  <span className="stat-value max-bid">{maxBidDisplay(team)}</span>
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
          onClose={() => setModalTeamId(null)}
        />
      )}
    </div>
  );
}
