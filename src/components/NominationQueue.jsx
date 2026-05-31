import './NominationQueue.css';

export default function NominationQueue({ draft, teams, selectedTeamId }) {
  const orderIds   = draft?.nominationOrderIds || [];
  const totalPicks = draft?.nominationIndex ?? 0;
  const currentPos = totalPicks % 12;
  const myPos      = orderIds.indexOf(selectedTeamId);

  // How many picks until this user's turn (0 = right now)
  const picksUntilMyTurn = myPos === -1
    ? null
    : (myPos - currentPos + 12) % 12;

  const isMyTurn = picksUntilMyTurn === 0;

  // Turn callout message
  let turnMessage = null;
  if (myPos !== -1) {
    if (isMyTurn) {
      turnMessage = { text: "🎯 It's your turn to nominate!", style: 'now' };
    } else if (picksUntilMyTurn === 1) {
      turnMessage = { text: '⏭ You\'re up next', style: 'soon' };
    } else {
      turnMessage = { text: `${picksUntilMyTurn} picks until your turn`, style: 'waiting' };
    }
  }

  return (
    <div className="nom-queue">
      <div className="nom-queue-header">
        <span className="nom-queue-title">Nomination Order</span>
        <span className="nom-queue-round">
          Round {Math.floor(totalPicks / 12) + 1} · Pick {currentPos + 1} of 12
        </span>
      </div>

      {turnMessage && (
        <div className={`nom-turn-callout ${turnMessage.style}`}>
          {turnMessage.text}
        </div>
      )}

      <div className="nom-queue-list">
        {orderIds.map((teamId, idx) => {
          const team      = teams[teamId];
          const isCurrent = idx === currentPos;
          const isMe      = teamId === selectedTeamId;
          // Show past picks as faded, current bold, upcoming normal
          const isPast    = idx < currentPos;

          return (
            <div
              key={teamId}
              className={`nom-queue-row
                ${isCurrent ? 'current' : ''}
                ${isPast    ? 'past'    : ''}
                ${isMe      ? 'mine'    : ''}
              `}
            >
              <span className="nom-queue-pos">{idx + 1}</span>
              <span className="nom-queue-name">{team?.name ?? teamId}</span>
              <span className="nom-queue-owner">{team?.ownerName ?? ''}</span>
              <span className="nom-queue-budget">
                ${team?.budgetRemaining ?? 200}
              </span>
              {isCurrent && <span className="nom-queue-badge">NOW</span>}
              {isMe && !isCurrent && (
                <span className="nom-queue-me-badge">YOU</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
