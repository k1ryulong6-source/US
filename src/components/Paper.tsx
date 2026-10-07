import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { MAX_DROPS, Painter, type Bead, type Bloom, type Ribbon, type Scene, type Soak, type Wash } from '../lib/watercolour';

/**
 * One sheet of paper behind the whole app. Elements on the page say what paint belongs
 * to them (usePaint); every frame the sheet asks each visible one where it is and paints
 * only what the screen can show, so a long timeline costs no more than a short one.
 */

export interface Piece {
  washes?: (Wash & { photo?: Soak | null })[];
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
/** false when there is no WebGL: elements then show plain fallbacks (e.g. an ordinary photo). */
const CanPaint = createContext(true);
/** true once the paper can actually paint (or never will): openings wait for it */
const PaperReady = createContext(false);

const PAPER = '#F7F3EB';
const PAPER_DARK = '#1F1C19';

export function PaperProvider({ children }: { children: ReactNode }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const entries = useRef(new Set<Entry>());
  const blooms = useRef<Bloom[]>([]);
  const clock = useRef(0);
  const [canPaint, setCanPaint] = useState(true);
  const [ready, setReady] = useState(false);
  // Paint mostly moves slowly; it only needs smooth frames while something is happening
  // (a drop spreading, a bloom, a page arriving). Until then it is redrawn a few times a second.
  const busyUntil = useRef(0);
  const wake = (ms: number) => {
    busyUntil.current = Math.max(busyUntil.current, performance.now() + ms);
  };
  const api = useRef<PaperApi>({
    register(entry) {
      entries.current.add(entry);
      wake(2000);
      return () => {
        entries.current.delete(entry);
        wake(600);
      };
    },
    bloom(x, y, r = 40) {
      if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      blooms.current = [...blooms.current.slice(-3), { x, y: y + window.scrollY, start: clock.current, r }];
      wake(3000);
    },
  });

  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    el.style.visibility = 'hidden';
    const tc = performance.now();
    const painter = Painter.create(el);
    (window as unknown as { __paperCompileMs: number }).__paperCompileMs = performance.now() - tc;
    if (!painter) {
      el.style.display = 'none'; // no WebGL: the CSS paper colour carries the page
      setCanPaint(false);
      return;
    }
    const dark = matchMedia('(prefers-color-scheme: dark)');
    const still = matchMedia('(prefers-reduced-motion: reduce)');
    const t0 = performance.now();
    let raf = 0;
    // Resolution adapts only when a phone can't keep up: a fast one always paints at full sharpness,
    // a slow one steps down a little rather than stutter, and steps back up when it can.
    let quality = 1;
    let last = 0;
    let slow = 0;
    let fast = 0;
    // The canvas lives in the page and scrolls with it, so paint and words move together
    // (scrolling never waits for a repaint). It covers the screen plus a margin above and
    // below, and is moved and repainted at most ~30 times a second, or sooner when a fast
    // scroll gets close to the edge of what was painted.
    let paintedAt = -1;
    let isReady = false;
    // measuring (localStorage us-perf=1): frames painted, time spent, what was on screen
    const perf = (() => {
      try {
        if (localStorage.getItem('us-perf') !== '1') return null;
      } catch {
        return null;
      }
      const stats = { frames: 0, ms: 0, drops: 0, washes: 0, area: 0 };
      (window as unknown as { __paper: typeof stats }).__paper = stats;
      return stats;
    })();
    let paintedScroll = 0;

    const frame = (ts: number) => {
      raf = requestAnimationFrame(frame);
      if (document.hidden) {
        last = 0;
        return;
      }
      // the paint may still be compiling in the background: the plain paper shows meanwhile
      if (!isReady) {
        try {
          if (!painter.ready()) return;
        } catch {
          cancelAnimationFrame(raf);
          el.style.display = 'none';
          setCanPaint(false);
          return;
        }
        isReady = true;
        wake(2000);
      }
      const vh = window.innerHeight;
      const vw = window.innerWidth;
      const sy = window.scrollY;
      const over = Math.round(vh * 0.35);
      const busy = performance.now() < busyUntil.current;
      const interval = busy ? 31 : 83;
      if (paintedAt >= 0 && ts - paintedAt < interval && Math.abs(sy - paintedScroll) < over * 0.5) return;
      // scrolling counts as something happening
      if (Math.abs(sy - paintedScroll) > 1) wake(400);
      // only judge speed between smooth frames
      if (last && busy && ts - last < 80) {
        const dt = ts - last;
        if (dt > 48) slow++;
        else if (dt < 36) fast++;
        if (slow > 12) {
          quality = Math.max(0.5, quality - 0.15);
          slow = fast = 0;
        } else if (fast > 120) {
          quality = Math.min(1, quality + 0.1);
          slow = fast = 0;
        }
      }
      last = ts;
      paintedAt = ts;
      paintedScroll = sy;
      // with reduced motion the paint is shown fully spread and stays still
      const time = still.matches ? 40 : (performance.now() - t0) / 1000;
      clock.current = time;
      const scene: Scene = { washes: [], ribbon: null, bead: null };
      let drops = 0;
      for (const entry of entries.current) {
        const node = entry.el.current;
        if (!node) continue;
        const rect = node.getBoundingClientRect();
        if (rect.bottom < -over - 240 || rect.top > vh + over + 240) continue;
        const piece = entry.paint.current(rect);
        if (!piece) continue;
        for (const w of piece.washes ?? []) {
          if (w.y + 2 * w.s < -over || w.y - 2 * w.s > vh + over) continue;
          if (drops + w.drops.length > MAX_DROPS) continue;
          drops += w.drops.length;
          scene.washes.push({ ...w, y: w.y + over });
        }
        if (piece.ribbon) {
          scene.ribbon = {
            ...piece.ribbon,
            top: piece.ribbon.top + over,
            pts: piece.ribbon.pts.map(([x, y, wd, st]) => [x, y + over, wd, st] as [number, number, number, number]),
          };
        }
        if (piece.bead) scene.bead = { ...piece.bead, y: piece.bead.y + over };
      }
      const height = vh + 2 * over;
      el.style.height = `${height}px`;
      el.style.transform = `translate3d(0, ${sy - over}px, 0)`;
      const t1 = perf ? performance.now() : 0;
      painter.render({
        scene,
        time,
        width: vw,
        height,
        // watercolour is soft: 1.5x is as sharp as it needs to be on any phone
        dpr: Math.max(0.75, Math.min(window.devicePixelRatio || 1, 1.5) * quality),
        scrollY: sy - over,
        blooms: blooms.current.map((b) => ({ ...b, y: b.y - sy + over })),
        paper: PAPER,
        paperDark: PAPER_DARK,
        dark: dark.matches,
      });
      // first real frame: show the canvas (until now it would have been blank, i.e. black)
      if (el.style.visibility === 'hidden') {
        el.style.visibility = '';
        setReady(true);
      }
      if (perf) {
        painter.finish();
        perf.frames++;
        perf.ms += performance.now() - t1;
        perf.drops = drops;
        perf.washes = scene.washes.length;
        perf.area = Math.round(painter.paintedArea);
      }
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      painter.dispose();
    };
  }, []);

  return (
    <PaperContext.Provider value={api.current}>
      <CanPaint.Provider value={canPaint}>
        <PaperReady.Provider value={ready || !canPaint}>
        <canvas ref={canvas} className="paper-canvas" aria-hidden="true" />
        {children}
        </PaperReady.Provider>
      </CanPaint.Provider>
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

export function usePaperReady() {
  return useContext(PaperReady);
}

export function useCanPaint() {
  return useContext(CanPaint);
}

/** true when the person asked for reduced motion: paint is shown fully spread and stays still */
export function useStill() {
  const [still, setStill] = useState(() => matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    const q = matchMedia('(prefers-reduced-motion: reduce)');
    const on = () => setStill(q.matches);
    q.addEventListener('change', on);
    return () => q.removeEventListener('change', on);
  }, []);
  return still;
}
