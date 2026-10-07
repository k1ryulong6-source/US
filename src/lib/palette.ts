// Everyone picks one pigment (profiles.color). It is how they appear in every US:
// their part of a shared wash, the flecks they leave, the drop on their own page.
// The list must match the check constraint in 20261007000100_colors.sql.

export const PALETTE = [
  { hex: '#E2B21F', name: '藤黄' },
  { hex: '#E58A2E', name: '橙' },
  { hex: '#D2493C', name: '朱红' },
  { hex: '#D9677A', name: '玫瑰' },
  { hex: '#E3A0AE', name: '桃粉' },
  { hex: '#B0508A', name: '洋红' },
  { hex: '#7D5FA8', name: '紫' },
  { hex: '#2779BE', name: '群青' },
  { hex: '#5BA8D8', name: '天青' },
  { hex: '#3E9C9A', name: '青绿' },
  { hex: '#6E9A57', name: '树绿' },
  { hex: '#A3A23A', name: '橄榄' },
  { hex: '#C9852E', name: '赭石' },
  { hex: '#7A5A44', name: '棕' },
] as const;

export type Pigment = (typeof PALETTE)[number]['hex'];

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** A person's pigment: the one they chose, or a stable default derived from their id. */
export function colorOf(userId: string, chosen?: string | null): string {
  if (chosen && PALETTE.some((p) => p.hex === chosen)) return chosen;
  return PALETTE[hash(userId) % PALETTE.length].hex;
}

/**
 * Colours for the people in one US, in join order. When two people share a pigment, the
 * one who joined later is shown with the nearest free pigment, so nobody disappears into
 * someone else's colour. `me` always keeps their own.
 */
export function usColors(
  members: { user_id: string; color?: string | null }[],
  me?: string,
): Map<string, string> {
  const out = new Map<string, string>();
  const taken = new Set<string>();
  const ordered = [...members].sort((a, b) => (a.user_id === me ? -1 : b.user_id === me ? 1 : 0));
  for (const m of ordered) {
    let c = colorOf(m.user_id, m.color);
    if (taken.has(c)) {
      const start = PALETTE.findIndex((p) => p.hex === c);
      for (let k = 1; k < PALETTE.length; k++) {
        const next = PALETTE[(start + k) % PALETTE.length].hex;
        if (!taken.has(next)) {
          c = next;
          break;
        }
      }
    }
    taken.add(c);
    out.set(m.user_id, c);
  }
  return out;
}

/** Small deterministic random numbers so every wash keeps its own shape between visits. */
export function seeded(key: string) {
  let s = hash(key) || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 10000) / 10000;
  };
}
