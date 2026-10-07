import type { CSSProperties } from 'react';
import Wash from './Wash';
import type { Drop } from '../lib/watercolour';

/**
 * A photo left as it is, set into wet paint: the picture sits in the middle, untouched,
 * and the colour (yours, or everyone's) runs around its edge.
 */
export function ringDrops(colors: string[]): Drop[] {
  const cs = colors.length ? colors : ['#9C9488'];
  const n = Math.max(6, cs.length);
  const drops: Drop[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + 0.4;
    drops.push({ x: Math.cos(a) * 0.5, y: Math.sin(a) * 0.5, r: 0.42, color: cs[i % cs.length], alpha: 0.82 });
  }
  return drops;
}

export default function PaintedPhoto({
  url,
  colors,
  seed = 3.3,
  className,
  style,
}: {
  url: string;
  colors: string[];
  seed?: number;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <span className={className ? `painted-photo ${className}` : 'painted-photo'} style={style}>
      <Wash className="painted-photo-wash" drops={ringDrops(colors)} seed={seed} flow={0.05} />
      <img className="painted-photo-img" src={url} alt="" draggable={false} />
    </span>
  );
}
