import { useEffect, useRef, type ReactNode } from 'react';
import { t } from '../strings';

/** A sheet of paper slid up from the bottom, for one small decision. */
export default function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    box.current?.querySelector<HTMLElement>('input, textarea, button')?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="sheet-veil" onClick={onClose}>
      <div ref={box} className="sheet" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <p className="sheet-title">{title}</p>
        {children}
        <button type="button" className="sheet-cancel" onClick={onClose}>
          {t.photo.cancel}
        </button>
      </div>
    </div>
  );
}
