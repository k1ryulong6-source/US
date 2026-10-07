import { createContext, useContext, useEffect, useLayoutEffect, useRef, type ReactNode, type RefObject } from 'react';
import { MAX_DROPS, Painter, type Bead, type Bloom, type Ribbon, type Scene, type Wash } from '../lib/watercolour';

/**
 * One sheet of paper behind the whole app. Elements on the page say what paint belongs
 * to them (usePaint); every frame the sheet asks each visible one where it is and paints
 * only what the screen can show, so a long timeline costs no more than a short one.
 */

export interface Piece {
  washes?: (Wash & { soak?: { image: HTMLImageElement; rect: [number, number, number, number] } | null })[];
  ribbon?: Ribbon | null;
  bead?: Bead | null;
}
export type Painting = (rect: DOMRect) => Piece | null;

interface Entry {
  el: RefObject<Element | null>;
  paint: RefObject<Painting>;
}

interface PaperApi {
  register(entry: Entry): () => void;
  /** a drop of clean water where the finger landed */
  bloom(clientX: number, clientY: number, r?: number): void;
}

const PaperContext = createContext<PaperApi>({ register: () => () => undefined, bloom: () => undefined });

const PAPER = '#F7F3EB';
const PAPER_DARK = '#1F1C19';

export function PaperProvider({ children }: { children: ReactNode }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const entries = useRef(new Set<Entry>());
  const blooms = useRef<Bloom[]>([]);
  const clock = useRef(0);
  const api = useRef<PaperApi>({
    register(entry) {
      entries.current.add(entry);
      return () => entries.current.delete(entry);
    },
    bloom(x, y, r = 40) {
      if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      blooms.current = [...blooms.current.slice(-3), { x, y: y + window.scrollY, start: clock.current, r }];
    },
  });

  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const painter = Painter.create(el);
    if (!painter) {
      el.style.display = 'none'; // no WebGL: the CSS paper colour carries the page
      return;
    }
    const dark = matchMedia('(prefers-color-scheme: dark)');
    const still = matchMedia('(prefers-reduced-motion: reduce)');
    const t0 = performance.now();
    let raf = 0;

    const frame = () => {
      raf = requestAnimationFrame(frame);
      if (document.hidden) return;
      // with reduced motion the paint is shown fully spread and stays still
      const time = still.matches ? 40 : (performance.now() - t0) / 1000;
      clock.current = time;
      const vh = window.innerHeight;
      const vw = window.innerWidth;
      const scene: Scene = { washes: [], ribbon: null, bead: null, soak: null };
      let drops = 0;
      for (const entry of entries.current) {
        const node = entry.el.current;
        if (!node) continue;
        const rect = node.getBoundingClientRect();
        if (rect.bottom < -240 || rect.top > vh + 240) continue;
        const piece = entry.paint.current(rect);
        if (!piece) continue;
        for (const w of piece.washes ?? []) {
          if (w.y + 2 * w.s < 0 || w.y - 2 * w.s > vh) continue;
          if (drops + w.drops.length > MAX_DROPS) continue;
          drops += w.drops.length;
          if (w.soak) scene.soak = { image: w.soak.image, rect: w.soak.rect, wash: scene.washes.length };
          scene.washes.push(w);
        }
        if (piece.ribbon) scene.ribbon = piece.ribbon;
        if (piece.bead) scene.bead = piece.bead;
      }
      const sy = window.scrollY;
      painter.render({
        scene,
        time,
        width: vw,
        height: vh,
        dpr: Math.min(window.devicePixelRatio || 1, 2),
        scrollY: sy,
        blooms: blooms.current.map((b) => ({ ...b, y: b.y - sy })),
        paper: PAPER,
        paperDark: PAPER_DARK,
        dark: dark.matches,
      });
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      painter.dispose();
    };
  }, []);

  return (
    <PaperContext.Provider value={api.current}>
      <canvas ref={canvas} className="paper-canvas" aria-hidden="true" />
      {children}
    </PaperContext.Provider>
  );
}

/** Attach paint to an element. `paint` gets the element's current viewport rect every frame. */
export function usePaint(el: RefObject<Element | null>, paint: Painting) {
  const ctx = useContext(PaperContext);
  const latest = useRef(paint);
  useLayoutEffect(() => {
    latest.current = paint;
  });
  useEffect(() => ctx.register({ el, paint: latest }), [ctx, el]);
}

export function useBloom() {
  return useContext(PaperContext).bloom;
}
