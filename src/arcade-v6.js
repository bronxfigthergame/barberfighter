/** The Arcade owns both fighter selections even with zero gamepads.
 * A human P2 is an explicit opt-in only when two gamepads are detected.
 */
export function selectArcadeFighter(previous, activeSide, fighterId, mode) {
  if (!previous || typeof fighterId!=='string' || !fighterId.trim()) throw Error('Lutador inválido');
  const side=activeSide===2?2:1;
  const chosen=side===1?'p1':'p2';
  return {selected:{...previous,[chosen]:fighterId},activeSide:mode==='cpu'&&side===1?2:side};
}
export function resolveArcadeMatchMode(mode, wantHuman, count) {
  if (mode!=='cpu') return mode;
  return wantHuman && Number(count)>=2?'versus':'cpu';
}
