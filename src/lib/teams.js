import { overall } from './players'

export function scoreBy(p, criterion){
  const s = p.stats;
  switch(criterion){
    case 'attack':  return s.Shooting + s.Dribbling + s.Passing;
    case 'physical': return s.Physical + s.Stamina;
    case 'pace':    return s.Pace;
    default:        return overall(p); // 평균(인성 포함)
  }
}

export function balanceTeams(players, criterion){
  const sorted = [...players].sort((a,b)=> scoreBy(b,criterion) - scoreBy(a,criterion));
  const A = [], B = [];
  let sumA = 0, sumB = 0;
  for(const p of sorted){
    const val = scoreBy(p, criterion);
    if(sumA <= sumB){ A.push(p); sumA += val; }
    else{ B.push(p); sumB += val; }
  }
  return { A, B };
}
