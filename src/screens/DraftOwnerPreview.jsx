import { useEffect, useMemo, useState } from 'react';
import { onValue, ref } from 'firebase/database';

import MobileView from '../components/MobileView';
import ParticipantDesktopView from '../components/ParticipantDesktopView';
import { db } from '../firebase';
import { applyPersonalTierUpdates } from '../utils/personalTiers';
import { applyPlayerNoteUpdate } from '../utils/playerNotes';

export default function DraftOwnerPreview({ themeToggle }) {
  const [draft, setDraft] = useState({});
  const [teams, setTeams] = useState({});
  const [players, setPlayers] = useState({});
  const [personalRanks, setPersonalRanks] = useState({});
  const [personalTiers, setPersonalTiers] = useState({});
  const [playerNotes, setPlayerNotes] = useState({});
  const [watchlist, setWatchlist] = useState({});
  const [mobile, setMobile] = useState(() => window.innerWidth < 768);
  const [localNomination, setLocalNomination] = useState(null);

  useEffect(() => {
    const unsubs = [
      onValue(ref(db, 'draft'), snapshot => setDraft(snapshot.val() || {})),
      onValue(ref(db, 'teams'), snapshot => setTeams(snapshot.val() || {})),
      onValue(ref(db, 'players'), snapshot => setPlayers(snapshot.val() || {})),
    ];
    const updateViewport = () => setMobile(window.innerWidth < 768);
    window.addEventListener('resize', updateViewport);
    return () => {
      unsubs.forEach(unsub => unsub());
      window.removeEventListener('resize', updateViewport);
    };
  }, []);

  const nominationOrderIds = useMemo(
    () => Object.keys(teams).filter(teamId => teamId !== 'commissioner').sort(),
    [teams],
  );
  const selectedTeamId = nominationOrderIds[0] || 'team_1';
  const previewDraft = {
    ...draft,
    status: 'active',
    nominationOrderIds,
    nominationIndex: 0,
    nominatingTeamId: selectedTeamId,
    currentNomination: localNomination,
  };
  const nominatedPlayer = localNomination ? players[localNomination.playerId] : null;

  function saveRanks(ranks, tierUpdates = null) {
    setPersonalRanks(ranks);
    if (tierUpdates) setPersonalTiers(current => applyPersonalTierUpdates(current, tierUpdates));
  }

  const props = {
    draft: previewDraft,
    teams,
    players,
    log: {},
    nominatedPlayer,
    currentNomination: localNomination,
    selectedTeamId,
    nominatingTeamId: selectedTeamId,
    onNominate: playerId => setLocalNomination({ playerId, nominatingTeamId: selectedTeamId, startedAt: Date.now() }),
    watchlist,
    onToggleWatch: playerId => setWatchlist(current => {
      const next = { ...current };
      if (next[playerId]) delete next[playerId];
      else next[playerId] = { watched: true };
      return next;
    }),
    personalRanks,
    onSavePersonalRanks: saveRanks,
    personalTiers,
    onSavePersonalTiers: updates => setPersonalTiers(current => applyPersonalTierUpdates(current, updates)),
    playerNotes,
    onSavePlayerNote: (playerId, text) => setPlayerNotes(current => applyPlayerNoteUpdate(current, playerId, text)),
    onTeamClear: () => {},
    themeToggle,
  };

  if (!Object.keys(players).length || !Object.keys(teams).length) {
    return <div className="app-loading"><p>Loading safe draft-day preview…</p></div>;
  }

  return mobile ? <MobileView {...props} /> : <ParticipantDesktopView {...props} />;
}
