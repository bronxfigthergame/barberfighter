export function boxesOverlap(a,b){
  return a.x<=b.x+b.w&&a.x+a.w>=b.x&&a.y<=b.y+b.h&&a.y+a.h>=b.y;
}
export function blocksHit(guarding,guardMode,hitLevel){
  return Boolean(guarding)&&((hitLevel==="low"&&guardMode==="low")||(hitLevel!=="low"&&guardMode==="high"));
}
export function isMoveActive(age,move){
  return age>=move.startup&&age<move.startup+move.active;
}
export function damageHealth(health,damage,infiniteHealth){
  return infiniteHealth?health:Math.max(0,health-damage);
}
export function timerWinner(aHealth,bHealth,aHits,bHits,tieBreakRoll){
  if(aHealth!==bHealth)return aHealth>bHealth?0:1;
  if(aHits!==bHits)return aHits>bHits?0:1;
  return tieBreakRoll<.5?0:1;
}
export function seriesWinner(wins,roundsToWin){
  if(wins[0]>=roundsToWin)return 0;
  if(wins[1]>=roundsToWin)return 1;
  return null;
}
export function storyOpponents(characterIds,selectedId,bossId){
  return characterIds.filter(id=>id!==selectedId&&id!==bossId).concat([bossId]);
}
