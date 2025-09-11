import { STAT_KEYS, labelOf } from './constants'

export function avgStats(players){
  const keys = STAT_KEYS;
  const res = Object.fromEntries(keys.map(k=>[k,0]));
  if(players.length===0) return res;
  for(const p of players) for(const k of keys) res[k] += (p.stats?.[k] ?? 0);
  for(const k of keys) res[k] = Math.round(res[k] / players.length);
  return res;
}

export function toRadarData(player){
  return STAT_KEYS.map(k => ({ metric: labelOf(k), value: player.stats[k] ?? 0 }));
}

export function mergeRadar(teamAvg, player){
  return STAT_KEYS.map(k => ({ metric: labelOf(k), team: teamAvg[k], player: player.stats[k] }));
}
