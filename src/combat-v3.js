/**
 * BRONX FIGHTER — COMBAT V3
 * Independent fighting-system utilities; no UI, roster, campaign, LAN or asset changes.
 * State is explicitly serializable so the existing host-authoritative LAN snapshots still work.
 */
export const BUFFER_FRAMES = 13;
export const MAX_CHAIN = 3;
export const DOUBLE_TAP_FRAMES = 13;
export const DASH_FRAMES = 10;

export const ATTACK_TUNING = Object.freeze({
  punch: {startup:6, active:5, recovery:13, damage:54, range:.72, hitHeight:.24, hitstun:23, blockstun:9, knockback:62, energy:9},
  uppercut: {startup:10, active:6, recovery:26, damage:83, range:.77, hitHeight:.34, hitstun:31, blockstun:14, knockback:123, energy:12},
  kick: {startup:11, active:5, recovery:21, damage:44, range:.90, hitHeight:.30, hitstun:20, blockstun:10, knockback:78, energy:8},
  low: {startup:9, active:5, recovery:19, damage:39, range:.80, hitHeight:.19, hitstun:21, blockstun:10, knockback:67, energy:8},
  air: {startup:8, active:6, recovery:19, damage:52, range:.75, hitHeight:.30, hitstun:23, blockstun:10, knockback:81, energy:9}
});

export function approach(current, target, step) {
  if (!Number.isFinite(current)) current = 0;
  return current < target ? Math.min(target, current + step) : Math.max(target, current - step);
}

export function freshCombatState(f) {
  f.prevInput = {};
  f.inputBuffer = [];
  f.inputTick = 0;
  f.moveVX = 0;
  f.dashTicks = 0;
  f.dashDirection = 0;
  f.lastDirectionTap = {direction:0, tick:-100};
  f.hitstop = 0;
  f.comboCount = 0;
  f.comboTarget = null;
  f.comboConnects = 0;
  f.lastAttackWasBlocked = false;
}

export function captureInput(f, input) {
  const prior = f.prevInput || {};
  f.inputTick = (f.inputTick || 0) + 1;
  f.inputBuffer = (f.inputBuffer || [])
    .filter(cmd => cmd.remaining > 1)
    .map(cmd => ({...cmd, remaining:cmd.remaining - 1}));
  const direction = Math.sign(Number(input.direction) || 0);
  const previousDirection = Math.sign(Number(prior.direction) || 0);
  // A discrete release/repress, not a held joystick, is needed to dash.
  if (direction && direction !== previousDirection) {
    const previous = f.lastDirectionTap || {direction:0,tick:-100};
    if (previous.direction === direction && f.inputTick - previous.tick <= DOUBLE_TAP_FRAMES) {
      f.dashTicks = DASH_FRAMES;
      f.dashDirection = direction;
    }
    f.lastDirectionTap = {direction, tick:f.inputTick};
  }
  for (const kind of ['punch','kick','special','up']) {
    if (Boolean(input[kind]) && !Boolean(prior[kind])) {
      f.inputBuffer.push({kind, remaining:BUFFER_FRAMES, direction, down:!!input.down, created:f.inputTick});
    }
  }
  if (f.inputBuffer.length > 8) f.inputBuffer.splice(0, f.inputBuffer.length - 8);
  f.prevInput = {...input};
  return f.inputBuffer;
}
export function peekBuffered(f, allowed) {
  return (f.inputBuffer || []).find(cmd => allowed.includes(cmd.kind)) || null;
}
export function takeBuffered(f, allowed) {
  const q = f.inputBuffer || [];
  const n = q.findIndex(cmd => allowed.includes(cmd.kind));
  return n < 0 ? null : q.splice(n,1)[0];
}
export function chooseAttack(f, command) {
  if (f.jumpY > 1) return 'air';
  if (command.kind === 'kick' && command.down) return 'low';
  if (command.kind === 'punch' && command.direction === f.facing) return 'uppercut';
  return command.kind === 'kick' ? 'kick' : 'punch';
}
export function adjustedDamage(base, chain) {
  const multiplier = chain === 2 ? .84 : chain >= 3 ? .68 : 1;
  return Math.max(1, Math.round(base * multiplier));
}
export function isActiveFrame(move, age) {
  return age >= move.startup && age < move.startup + move.active;
}
export function canCancel(attack) {
  if (!attack || !attack.hitDone || attack.blocked) return false;
  const {move,age} = attack;
  return age >= move.startup + move.active - 1 &&
         age < move.startup + move.active + Math.max(3, Math.ceil(move.recovery * .65));
}

export function impactPoseIndex(frames) {
  if (!frames || !frames.length) return 0;
  let idx=0, distance=-Infinity;
  for (let i=0;i<frames.length;i++) {
    const f=frames[i];
    if (!f) continue;
    // The reach from pivot (the fighter's feet) approximates the extended limb.
    const d = (Number(f.width)||0) - (Number(f.pivot?.x) || (Number(f.width)||0)/2);
    if (d > distance) {distance=d; idx=i;}
  }
  return idx;
}
export function attackPoseIndex(age, move, length, impactIndex) {
  if (length <= 1) return 0;
  const contact=Math.max(0,Math.min(length-1,impactIndex));
  const startup=Math.max(1,move.startup),active=Math.max(1,move.active),recovery=Math.max(1,move.recovery);
  if (age < startup) {
    if (contact===0) return 0;
    return Math.min(contact-1,Math.floor(Math.max(0,age)*(contact)/startup));
  }
  if (age < startup + active) return contact;
  const t=Math.max(0,Math.min(1,(age-startup-active)/recovery));
  // Last-frame contact (some air attacks) needs a reverse recovery, not a frozen sprite.
  if (contact===length-1) return Math.max(0,contact-Math.floor(t*length));
  return Math.min(length-1, contact + Math.floor(t * (length-contact)));
}

/** Fighter-relative torso collision, changes with crouching, jumping and floor fall. */
export function bodyHurtBox(f, frame, floorY) {
  const h = f.bodyHeight * f.scale;
  const down = f.state === 'crouch' || ((f.state==='guard' || f.state==='blockstun') && f.guardMode==='low');
  const fallen = f.state==='fall'||f.state==='lose';
  const effectiveHeight = h*(fallen ? .28 : down ? .50 : f.jumpY>0 ? .76 : .84);
  const fullWidth = h*(fallen ? .64 : down ? .36 : .31);
  const shift = frame && frame.pivot
    ? Math.max(-h*.055,Math.min(h*.055,((frame.width/2)-frame.pivot.x)*f.scale*.13)) * f.facing : 0;
  return {x:f.x + shift-fullWidth/2,y:floorY-f.jumpY-effectiveHeight,w:fullWidth,h:effectiveHeight};
}
/** Contact only reaches as far as the current ATTACK pose extends. */
export function strikeHitBox(f, move, frame, floorY, type) {
  if (!frame || !frame.pivot) return {x:f.x,y:floorY,w:0,h:0};
  const H=f.bodyHeight*f.scale;
  const projected=Math.max(0,(frame.width-frame.pivot.x)*f.scale);
  const reach=Math.min(H*move.range*.82,Math.max(H*.10, projected-H*.13));
  const inset=H*.06;
  const w=Math.max(H*.06,reach-inset);
  const base=floorY-f.jumpY;
  const centerRatio = type==='low' ? .17 : type==='kick' ? .41 : type==='uppercut' ? .72 : type==='air' ? .47 : .66;
  const centerY=base-H*centerRatio;
  const boxHeight=H*move.hitHeight;
  return {x:f.facing>0 ? f.x+inset : f.x-inset-w,y:centerY-boxHeight/2,w,h:boxHeight};
}
export function phaseName(attack) {
  if (!attack) return 'none';
  const {age,move}=attack;
  return age < move.startup ? 'startup' : age < move.startup + move.active ? 'active' : 'recovery';
}
