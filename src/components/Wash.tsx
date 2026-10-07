import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useCanPaint, usePaint } from './Paper';
import type { Drop } from '../lib/watercolour';

interface Props {
  drops: Drop[];
  /** how fast the pigment moves; 0 = dried (a quiet US) */
  flow?: number;
  seed?: number;
  strength?: number;
  /** spread out from a single drop (seconds⁻¹) */
  grow?: number;
  /** wash size relative to the box */
  scale?: number;
  /** a photo soaked into the wash: it shows where the paint is, the wet edge stays paint */
  photo?: string | null;
  photoK?: [number, number];
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
}

/** A box on the page with paint in it; the paint itself is drawn by the paper behind. */
export default function Wash({
  drops,
  flow = 0.045,
  seed = 1,
  strength,
  grow,
  scale = 1,
  photo,
  photoK,
  className,
  style,
  children,
}: Props) {
  const ref = useRef<HTMLSpanElement>(null);
  const canPaint = useCanPaint();
  const soaked = useSquarePhoto(canPaint ? photo : null);

  usePaint(ref, (r) => {
    if (!drops.length || r.width === 0) return null;
    const s = (Math.min(r.width, r.height) / 2) * scale;
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;
    const soak = soaked.canvas
      ? { image: soaked.canvas, rect: [x - s * 1.02, y - s * 1.02, s * 2.04, s * 2.04] as [number, number, number, number], k: photoK }
      : null;
    return { washes: [{ x, y, s, flow, seed, strength, grow, drops, soak }] };
  });

  const plain = photo && (!canPaint || soaked.failed);
  return (
    <span ref={ref} className={className ? `wash ${className}` : 'wash'} style={style}>
      {plain && <img className="wash-photo-plain" src={photo} alt="" />}
      {children}
    </span>
  );
}

/** Load a photo and crop it square once, so the paper can paint it every frame. */
function useSquarePhoto(url: string | null | undefined) {
  const [state, setState] = useState<{ canvas: HTMLCanvasElement | null; failed: boolean }>({ canvas: null, failed: false });
  useEffect(() => {
    setState({ canvas: null, failed: false });
    if (!url) return;
    let alive = true;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (!alive) return;
      const side = 512;
      const c = document.createElement('canvas');
      c.width = c.height = side;
      const ctx = c.getContext('2d');
      const k = Math.min(img.naturalWidth, img.naturalHeight);
      try {
        ctx?.drawImage(img, (img.naturalWidth - k) / 2, (img.naturalHeight - k) / 2, k, k, 0, 0, side, side);
        ctx?.getImageData(0, 0, 1, 1); // throws if the photo came without CORS headers
        c.addEventListener('soakfailed', () => alive && setState({ canvas: null, failed: true }));
        setState({ canvas: c, failed: false });
      } catch {
        setState({ canvas: null, failed: true });
      }
    };
    img.onerror = () => alive && setState({ canvas: null, failed: true });
    img.src = url;
    return () => {
      alive = false;
    };
  }, [url]);
  return state;
}
