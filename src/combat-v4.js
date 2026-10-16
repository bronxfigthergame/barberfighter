/**
 * BRONX FIGHTER — V4 contact correction.
 * Preserve the original animations, damage/knockback and control mappings.
 * Widen the actual attack limb's range conservatively, so a kick at plausible
 * striking distance doesn't whiff due to a small pivot-based rectangle.
 */
export { approach, freshCombatState, captureInput, peekBuffered, takeBuffered,
  chooseAttack, adjustedDamage, canCancel, impactPoseIndex, attackPoseIndex,
  bodyHurtBox, phaseName, MAX_CHAIN, ATTACK_TUNING } from './combat-v3.js';

/**
 * Contact volume derived from the currently drawn atlas frame.
 * Side of attack always follows facing.  Contact remains restricted to the
 * attack's active frames by the unchanged simulation, not every animation frame.
 */
export function strikeHitBox(f, move, frame, floorY, type) {
  if (!frame || !frame.pivot || !move || !Number.isFinite(f.scale))
    return {x:f.x,y:floorY,w:0,h:0};

  const H = Math.max(1, f.bodyHeight * f.scale);
  const projected = Math.max(0, (frame.width - frame.pivot.x) * f.scale);
  const ratios = {
    kick: { minReach:.61, maxReach:.95, sidePadding:.10, height:.33, center:.43 },
    low: { minReach:.55, maxReach:.84, sidePadding:.085, height:.23, center:.20 },
    air: { minReach:.49, maxReach:.78, sidePadding:.09, height:.34, center:.43 },
    punch: { minReach:.37, maxReach:.74, sidePadding:.07, height:.28, center:.67 },
    uppercut: { minReach:.43, maxReach:.82, sidePadding:.08, height:.40, center:.72 }
  };
  const rules = ratios[type] || ratios.punch;
  // The source atlas pivots indicate the anchor point, not the literal foot-tip.
  // Use visual extension where available but enforce a minimum strike envelope.
  const reach = Math.min(H * Math.min(rules.maxReach, (move.range || rules.maxReach)*1.06),
    Math.max(projected - H * .065, H * rules.minReach));
  const inset = H * rules.sidePadding;
  const width = Math.max(1, reach - inset);
  const base = floorY - (f.jumpY || 0);
  const height = H * Math.max(rules.height, (move.hitHeight || 0));
  const center = base - H * rules.center;
  return {
    x: f.facing > 0 ? f.x + inset : f.x - inset - width,
    y: center - height / 2,
    w: width,
    h: height
  };
}

/** Testable contact helper: use the original collision function's AABB rules. */
export function checkContact(attackBox, hurtBox) {
  return attackBox.w>0 && attackBox.h>0 &&
    attackBox.x <= hurtBox.x+hurtBox.w && attackBox.x+attackBox.w >= hurtBox.x &&
    attackBox.y <= hurtBox.y+hurtBox.h && attackBox.y+attackBox.h >= hurtBox.y;
}
