// A pair may not appear among either of the previous two selections.
export function eligibleTracks(tracks,history){const blocked=new Set(history.slice(-2).map(t=>t.pairId));return tracks.filter(t=>!blocked.has(t.pairId));}
export function shuffledRound(tracks,history=[],random=Math.random){
 const pool=[...new Map(tracks.map(t=>[t.id,t])).values()];let budget=20000;
 const shuffle=values=>{const result=[...values];for(let i=result.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[result[i],result[j]]=[result[j],result[i]];}return result;};
 function search(remaining,recent){
  if(!remaining.length)return [];
  if(--budget<0)return null;
  for(const next of shuffle(eligibleTracks(remaining,recent))){const rest=search(remaining.filter(t=>t.id!==next.id),[...recent.slice(-1),next]);if(rest)return [next,...rest];}
  return null;
 }
 // Small or heavily imbalanced libraries can be impossible. Never break spacing.
 return search(pool,history)||shuffle(eligibleTracks(pool,history)).slice(0,1);
}
