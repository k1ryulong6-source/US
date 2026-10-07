import { PALETTE } from '../lib/palette';
import { t } from '../strings';
import Wash from './Wash';
import { PencilLoop } from './Pencil';

/** The 14 pigments, each a real drop of paint; the chosen one is ringed in pencil. */
export default function Palette({ value, onChange }: { value: string; onChange: (hex: string) => void }) {
  return (
    <div className="palette" role="radiogroup" aria-label={t.me.color}>
      {PALETTE.map((p, i) => (
        <button
          key={p.hex}
          type="button"
          role="radio"
          aria-checked={p.hex === value}
          aria-label={p.name}
          className="swatch"
          onClick={() => onChange(p.hex)}
        >
          <Wash className="swatch-paint" drops={[{ x: 0, y: 0, r: 0.82, color: p.hex, alpha: 0.9 }]} seed={4 + i} flow={0.05} />
          {p.hex === value && <PencilLoop width={36} height={36} seed="chosen" />}
        </button>
      ))}
    </div>
  );
}
