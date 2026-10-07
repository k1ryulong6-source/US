import { useRef, type ReactNode } from 'react';
import { usePaint } from './Paper';

/** A drop of paint that hasn't fallen yet: glossy, still wet. Marks "now" — something to do. */
export default function WetDrop({ color, size = 26, children }: { color: string; size?: number; children?: ReactNode }) {
  const ref = useRef<HTMLSpanElement>(null);
  usePaint(ref, (r) => ({ bead: { x: r.left + r.width / 2, y: r.top + r.height / 2, r: (Math.min(r.width, r.height) / 2) * 0.9, color } }));
  return (
    <span ref={ref} className="wet-drop" style={{ width: size, height: size }} aria-hidden={children ? undefined : true}>
      {children}
    </span>
  );
}
