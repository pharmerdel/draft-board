import { useEffect, useState } from 'react';
import { getPlayerData } from '../utils/sleeperStats';

export function usePlayerStats(sleeperPlayerId) {
  const [result, setResult] = useState({ playerId: null, stats: null, proj: null });

  useEffect(() => {
    if (!sleeperPlayerId) return undefined;

    let cancelled = false;
    getPlayerData(sleeperPlayerId).then(({ stats, proj }) => {
      if (!cancelled) setResult({ playerId: sleeperPlayerId, stats, proj });
    });
    return () => { cancelled = true; };
  }, [sleeperPlayerId]);

  if (!sleeperPlayerId) return { stats: null, proj: null, loading: false };
  if (result.playerId !== sleeperPlayerId) return { stats: undefined, proj: undefined, loading: true };
  return { stats: result.stats, proj: result.proj, loading: false };
}
