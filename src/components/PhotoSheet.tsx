import { useEffect, useRef, type ChangeEvent, type KeyboardEvent } from 'react';
import { t } from '../strings';
import { PencilAlbum, PencilCamera } from './Pencil';

interface Props {
  title: string;
  /** which camera "拍一张" opens: the front one for your own photo */
  facing?: 'user' | 'environment';
  canRemove: boolean;
  onPick: (file: File) => void;
  onRemove: () => void;
  onClose: () => void;
}

/**
 * Choose a photo: take one now (opens the phone's camera directly, no extra permission),
 * or pick from the album.
 */
export default function PhotoSheet({ title, facing = 'environment', canRemove, onPick, onRemove, onClose }: Props) {
  const first = useRef<HTMLLabelElement>(null);

  useEffect(() => {
    first.current?.focus();
    const onKey = (e: globalThis.KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // the rows are labels around file inputs; let Enter / Space open them like buttons
  function onRowKey(e: KeyboardEvent<HTMLLabelElement>) {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    e.currentTarget.querySelector('input')?.click();
  }

  function picked(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (f) onPick(f);
  }

  return (
    <div className="sheet-veil" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <p className="sheet-title">{title}</p>
        <label className="sheet-row" ref={first} tabIndex={0} onKeyDown={onRowKey}>
          <PencilCamera size={26} />
          <span>{t.photo.take}</span>
          <input type="file" accept="image/*" capture={facing} onChange={picked} className="sr-only" />
        </label>
        <label className="sheet-row" tabIndex={0} onKeyDown={onRowKey}>
          <PencilAlbum size={26} />
          <span>{t.photo.pick}</span>
          <input type="file" accept="image/*" onChange={picked} className="sr-only" />
        </label>
        {canRemove && (
          <button type="button" className="sheet-row quiet indent" onClick={onRemove}>
            {t.photo.remove}
          </button>
        )}
        <button type="button" className="sheet-cancel" onClick={onClose}>
          {t.photo.cancel}
        </button>
      </div>
    </div>
  );
}
