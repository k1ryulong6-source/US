import type { UsPreset } from '../lib/types';
import { t } from '../strings';

const PRESETS: UsPreset[] = ['family', 'partners', 'friends', 'work', 'other'];

export default function PresetPicker({
  value,
  onChange,
}: {
  value: UsPreset | null;
  onChange: (v: UsPreset | null) => void;
}) {
  return (
    <div className="chips" role="radiogroup">
      <button
        type="button"
        role="radio"
        aria-checked={value === null}
        className={value === null ? 'chip on' : 'chip'}
        onClick={() => onChange(null)}
      >
        {t.presets.none}
      </button>
      {PRESETS.map((p) => (
        <button
          key={p}
          type="button"
          role="radio"
          aria-checked={value === p}
          className={value === p ? 'chip on' : 'chip'}
          onClick={() => onChange(p)}
        >
          {t.presets[p]}
        </button>
      ))}
    </div>
  );
}
