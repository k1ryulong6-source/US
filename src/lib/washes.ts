import type { Drop } from './watercolour';

/**
 * Where each person's pigment lands in a shared wash. `colors[0]` is always you.
 * Each person also leaves a small fleck of their colour beside someone else's:
 * people in a relationship carry a little of each other.
 */
export function usWash(colors: string[]): Drop[] {
  const [me, ...others] = colors.slice(0, 6);
  if (!me) return [];
  if (others.length === 0) return [{ x: 0, y: 0, r: 0.74, color: me, alpha: 0.85 }];
  if (others.length === 1) {
    return [
      { x: -0.25, y: -0.22, r: 0.68, color: me, alpha: 0.85 },
      { x: 0.26, y: 0.27, r: 0.66, color: others[0], alpha: 0.8 },
      { x: -0.6, y: -0.98, r: 0.12, color: others[0], alpha: 0.85, aspect: 2.3, angle: -0.35 },
      { x: 0.74, y: 0.98, r: 0.12, color: me, alpha: 0.95, aspect: 2.3, angle: -0.35 },
    ];
  }
  const n = others.length + 1;
  const r = n <= 4 ? 0.57 : 0.5;
  const drops: Drop[] = [{ x: -0.34, y: -0.32, r, color: me, alpha: 0.85 }];
  others.forEach((c, i) => {
    const a = -Math.PI * 0.75 + ((i + 1) / n) * Math.PI * 2;
    drops.push({ x: Math.cos(a) * 0.46, y: Math.sin(a) * 0.46, r: r * 0.97, color: c, alpha: 0.82 });
  });
  drops.push({ x: -0.92, y: -0.82, r: 0.13, color: others[0], alpha: 0.9, aspect: 2.3, angle: -0.4 });
  drops.push({ x: 0.96, y: 0.86, r: 0.12, color: me, alpha: 0.95, aspect: 2.3, angle: -0.4 });
  return drops;
}

/** A memory's pool on the timeline: whoever wrote it, fused. */
export function pool(colors: string[]): Drop[] {
  const cs = [...new Set(colors)].slice(0, 3);
  if (cs.length <= 1) return cs.map((c) => ({ x: 0, y: 0, r: 0.76, color: c, alpha: 0.85 }));
  if (cs.length === 2) {
    return [
      { x: -0.28, y: -0.1, r: 0.62, color: cs[0], alpha: 0.85 },
      { x: 0.28, y: 0.12, r: 0.6, color: cs[1], alpha: 0.8 },
    ];
  }
  return cs.map((c, i) => {
    const a = -Math.PI / 2 + (i / 3) * Math.PI * 2;
    return { x: Math.cos(a) * 0.3, y: Math.sin(a) * 0.3, r: 0.55, color: c, alpha: 0.82 };
  });
}

/** A little clear water on the paper: where a photo (avatar, relationship) soaks in. */
export const CLEAR_WATER: Drop[] = [{ x: 0, y: 0, r: 0.86, color: '#BDB5A6', alpha: 0.25 }];
