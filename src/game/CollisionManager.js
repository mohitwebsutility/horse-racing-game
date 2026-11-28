/**
 * Lightweight lane-based collision: horses are treated as ellipses (long in z, narrow in x).
 * Overlap pushes them apart sideways and stops the horse behind from passing through the one in front.
 */
export class CollisionManager {
  constructor({ halfLength = 1.25, halfWidth = 0.55 } = {}) {
    this.halfLength = halfLength;
    this.halfWidth = halfWidth;
  }

  resolve(horses, dt) {
    const L = this.halfLength * 2, W = this.halfWidth * 2;
    for (const h of horses) h.blockedBy = null;
    for (let i = 0; i < horses.length; i++) {
      for (let j = i + 1; j < horses.length; j++) {
        const a = horses[i], b = horses[j];
        const dz = b.z - a.z, dx = b.x - a.x;
        if (Math.abs(dz) >= L || Math.abs(dx) >= W) continue;
        // Lateral shove away from each other
        const overlapX = W - Math.abs(dx);
        const dir = dx === 0 ? (a.index < b.index ? 1 : -1) : Math.sign(dx);
        const push = Math.min(overlapX * 0.5, 2.5 * dt);
        a.x -= dir * push; b.x += dir * push;
        // Horse behind cannot exceed the speed of the horse in front while overlapping longitudinally
        const [front, back] = dz > 0 ? [b, a] : [a, b];
        if (back.speed > front.speed) {
          back.speed = front.speed;
          back.boost = Math.max(0, back.boost - 6 * dt);
        }
        back.blockedBy = front;
        // Positional correction so they never interpenetrate along z
        const gap = Math.abs(dz);
        if (gap < L * 0.85) back.z = Math.min(back.z, front.z - L * 0.85);
      }
    }
  }
}
