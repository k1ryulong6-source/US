import { t } from '../strings';

/**
 * The handwriting comes in pieces by character range, each fetched the first time a page
 * needs it. Text that appears before its piece arrives is drawn in a stand-in face, then
 * re-flows when the real one lands: words jump. So at launch (behind the opening) we ask for
 * every character the app's own words use; what people write is fetched as it appears.
 */
export function warmFont() {
  if (!('fonts' in document)) return;
  const chars = new Set<string>();
  const walk = (v: unknown) => {
    if (typeof v === 'string' || typeof v === 'function') {
      for (const c of String(v)) if (c.charCodeAt(0) > 0x2e7f) chars.add(c);
    } else if (v && typeof v === 'object') Object.values(v).forEach(walk);
  };
  walk(t);
  const text = [...chars].join('') + 'US0123456789年月日';
  document.fonts.load(`17px "LXGW WenKai Screen"`, text).catch(() => undefined);
}
