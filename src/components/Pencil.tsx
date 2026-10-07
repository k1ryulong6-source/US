import { seeded } from '../lib/palette';

/**
 * Pencil marks: whatever is not painted yet (a plan, an empty place, a choice to make)
 * is drawn in pencil. Hand-drawn loops overshoot where they close, like a real stroke.
 */

function loopPath(cx: number, cy: number, rx: number, ry: number, seed: string): [string, string] {
  const rnd = seeded(seed);
  const a0 = rnd() * Math.PI * 2;
  const pts: string[] = [];
  for (let i = 0; i < 32; i++) {
    const a = a0 + (i / 28) * Math.PI * 2 * 1.08;
    const j = 1 + (rnd() - 0.5) * 0.07;
    pts.push(`${(cx + Math.cos(a) * rx * j).toFixed(1)} ${(cy + Math.sin(a) * ry * j).toFixed(1)}`);
  }
  const a1 = a0 + 2.2;
  const arc: string[] = [];
  for (let i = 0; i < 12; i++) {
    arc.push(`${(cx + Math.cos(a1 + i * 0.09) * rx * 1.05).toFixed(1)} ${(cy + Math.sin(a1 + i * 0.09) * ry * 1.06).toFixed(1)}`);
  }
  return [`M${pts.join(' L')}`, `M${arc.join(' L')}`];
}

export function PencilLoop({ width, height, seed }: { width: number; height: number; seed: string }) {
  const [d, d2] = loopPath(width / 2, height / 2, width / 2 - 2, height / 2 - 2, seed);
  return (
    <svg className="pencil" width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <path d={d} strokeWidth="0.8" opacity="0.75" strokeLinejoin="round" />
      <path d={d2} strokeWidth="0.6" opacity="0.4" />
    </svg>
  );
}

export function PencilPlus({ size = 18 }: { size?: number }) {
  return (
    <svg className="pencil" width={size} height={size} viewBox="0 0 18 18" aria-hidden="true">
      <path d="M9.2 2.5 L8.8 15.6 M2.4 9.1 L15.5 8.8" strokeWidth="1" opacity="0.8" />
    </svg>
  );
}

export function PencilCamera({ size = 22 }: { size?: number }) {
  return (
    <svg className="pencil" width={size} height={size} viewBox="0 0 22 22" aria-hidden="true">
      <path d="M3.2 7.4 L7.1 7.2 L8.6 4.9 L13.5 4.8 L15 7.1 L18.8 7.3 L18.9 17.2 L3.1 17.4 Z" strokeWidth="0.9" />
      <path d="M11 9.4 C 13.4 9.3, 14.6 11, 14.5 12.6 C 14.4 14.4, 12.8 15.5, 11 15.4 C 9.1 15.3, 7.6 14, 7.7 12.3 C 7.8 10.7, 9.2 9.5, 11.2 9.6" strokeWidth="0.8" />
    </svg>
  );
}

export function PencilAlbum({ size = 22 }: { size?: number }) {
  return (
    <svg className="pencil" width={size} height={size} viewBox="0 0 22 22" aria-hidden="true">
      <path d="M3.1 4.6 L18.7 4.3 L18.9 17.6 L3.2 17.8 Z" strokeWidth="0.9" />
      <path d="M5 15 L9 10.4 L12 13.4 L14.2 11.2 L17.2 14.8" strokeWidth="0.8" />
      <path d="M14.6 7.6 C 15.6 7.5, 15.9 8.6, 15.1 9 C 14.3 9.4, 13.7 8.2, 14.6 7.6" strokeWidth="0.7" />
    </svg>
  );
}

export function PencilMic({ size = 22 }: { size?: number }) {
  return (
    <svg className="pencil" width={size} height={size} viewBox="0 0 44 40" aria-hidden="true">
      <path d="M19.6 12.4 C 19.6 10.6, 24.4 10.6, 24.4 12.4 L24.4 20 C 24.4 21.8, 19.6 21.8, 19.6 20 Z" strokeWidth="1" />
      <path d="M16.8 18.6 C 16.8 25.4, 27.2 25.4, 27.2 18.6 M22 24.6 L22 28.2 M19.2 28.4 L24.8 28.2" strokeWidth="1" />
    </svg>
  );
}

/** A slightly uneven ruled line, as long as its box. */
export function PencilRule() {
  return (
    <svg className="pencil rule" viewBox="0 0 200 6" preserveAspectRatio="none" aria-hidden="true">
      <path d="M1 3.2 C 60 2.4, 130 3.9, 199 2.8" strokeWidth="0.6" opacity="0.5" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export function BackChevron() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" aria-hidden="true">
      <path d="M12.5 4 L6.5 10 L12.5 16" />
    </svg>
  );
}
