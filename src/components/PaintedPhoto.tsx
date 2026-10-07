import type { CSSProperties } from 'react';
import Wash from './Wash';
import { useCanPaint } from './Paper';
import type { Drop } from '../lib/watercolour';

/**
 * A photo left exactly as it is, with wet paint laid over its edges. The picture is square;
 * the paint runs along all four sides and over them, so what shows is shaped by the paint's
 * own edge (crisp, irregular, a darker rim where it dried), never by a mask or a blur.
 */

// the water the photo sits in: fills the square, adds no colour
const FRAME_WATER: Drop[] = [{ x: 0, y: 0, r: 1.6, color: '#FFFFFF', alpha: 0.01 }];

/** Paint along the four edges of the square: one long stroke per side, overlapping at the corners. */
export function edgeDrops(colors: string[]): Drop[] {
  const cs = colors.length ? colors : ['#9C9488'];
  const c = (i: number) => cs[i % cs.length];
  // each side a little crooked, so it reads as brushed, not ruled
  return [
    { x: 0.04, y: -1.08, r: 1.16, aspect: 3.4, angle: 0.05, color: c(0), alpha: 0.84 },
    { x: 1.08, y: 0.03, r: 1.14, aspect: 3.5, angle: Math.PI / 2 - 0.04, color: c(1), alpha: 0.84 },
    { x: -0.03, y: 1.08, r: 1.18, aspect: 3.3, angle: -0.06, color: c(2), alpha: 0.84 },
    { x: -1.08, y: -0.02, r: 1.14, aspect: 3.5, angle: Math.PI / 2 + 0.05, color: c(3), alpha: 0.84 },
  ];
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
  const canPaint = useCanPaint();
  return (
    <span className={className ? `painted-photo ${className}` : 'painted-photo'} style={style}>
      {canPaint ? (
        <>
          <Wash className="painted-photo-layer" drops={FRAME_WATER} photo={url} photoK={[1, 1]} scale={0.6} seed={seed} flow={0.02} />
          <Wash className="painted-photo-layer" drops={edgeDrops(colors)} scale={0.6} seed={seed + 1.7} flow={0.04} />
        </>
      ) : (
        // no WebGL: the photo, square and plain
        <img className="painted-photo-plain" src={url} alt="" draggable={false} />
      )}
    </span>
  );
}
