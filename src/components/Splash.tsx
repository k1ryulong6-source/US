import { useEffect, useMemo, useRef, useState } from 'react';
import { useCanPaint, useStill } from './Paper';
import Wash from './Wash';
import { t } from '../strings';

/**
 * Opening the app: two drops of pigment land on wet paper, spread, and where they meet a
 * third colour appears. Then "US" soaks in, in ink, and the paint fades back into the paper.
 * Your colour and the colour of the people in your first US, when we know them.
 */

const COLORS_KEY = 'us-splash-colors';
const SEEN_KEY = 'us-splashed';
const FALLBACK: [string, string] = ['#E2B21F', '#2779BE'];

// where each drop lands, in units of the wash's half-size (like the login mark)
const FIRST = { x: -0.25, y: -0.22, r: 0.66 };
const SECOND = { x: 0.26, y: 0.27, r: 0.64 };

// ms from start
const SECOND_LANDS = 380;
const WORD_SOAKS = 1000;
const LEAVING = 1750;
const DONE = 2250;

/** Remembered on this device only, so the next launch can paint before anything loads. */
export function rememberSplashColors(colors: string[]) {
  try {
    localStorage.setItem(COLORS_KEY, JSON.stringify(colors.slice(0, 2)));
  } catch {
    /* a plain splash is fine */
  }
}

function splashColors(): [string, string] {
  try {
    const c = JSON.parse(localStorage.getItem(COLORS_KEY) ?? 'null') as string[] | null;
    if (Array.isArray(c) && typeof c[0] === 'string') {
      // alone in a US (or none yet): meet the paper's own blue, or yellow if you are blue
      const other = c[1] ?? (c[0] === FALLBACK[1] ? FALLBACK[0] : FALLBACK[1]);
      return [c[0], other];
    }
  } catch {
    /* fall through */
  }
  return FALLBACK;
}

/** Once per launch: an installed app starts a new session each time it is opened. */
export function shouldSplash(): boolean {
  try {
    return !sessionStorage.getItem(SEEN_KEY);
  } catch {
    return false;
  }
}

function markSplashed() {
  try {
    sessionStorage.setItem(SEEN_KEY, '1');
  } catch {
    /* it just plays again */
  }
}

export default function Splash({ onDone }: { onDone: () => void }) {
  const canPaint = useCanPaint();
  const still = useStill();
  const [c1, c2] = useMemo(splashColors, []);
  const [first, setFirst] = useState(false);
  const [second, setSecond] = useState(false);
  const [word, setWord] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [fade, setFade] = useState(1);
  const finished = useRef(false);

  const finish = useRef<() => void>(() => undefined);
  finish.current = () => {
    if (finished.current) return;
    finished.current = true;
    markSplashed();
    onDone();
  };

  useEffect(() => {
    // asked for less motion: no opening at all
    if (still) {
      finish.current();
      return;
    }
    // Start once the paper has drawn two frames: the first launch compiles the paint,
    // and the first drop shouldn't spread while nobody can see it yet.
    const timers: number[] = [];
    let raf = requestAnimationFrame(() => {
      raf = requestAnimationFrame(() => {
        setFirst(true);
        timers.push(
          window.setTimeout(() => setSecond(true), SECOND_LANDS),
          window.setTimeout(() => setWord(true), WORD_SOAKS),
          window.setTimeout(() => setLeaving(true), LEAVING),
          window.setTimeout(() => finish.current(), DONE),
        );
      });
    });
    return () => {
      cancelAnimationFrame(raf);
      timers.forEach((id) => window.clearTimeout(id));
    };
  }, [still]);

  // the paper closes over the paint as the app comes up
  useEffect(() => {
    if (!leaving) return;
    let raf = 0;
    const start = performance.now();
    const step = (now: number) => {
      const k = Math.min(1, (now - start) / (DONE - LEAVING));
      setFade(1 - k * k);
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [leaving]);

  if (still) return null;

  return (
    <div
      className={leaving ? 'splash leaving' : 'splash'}
      role="button"
      tabIndex={0}
      aria-label={t.splash.skip}
      onClick={() => finish.current()}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && finish.current()}
    >
      <div className="splash-paint">
        {canPaint ? (
          <>
            {first && <Wash className="splash-wash" drops={[{ ...FIRST, color: c1, alpha: 0.86 }]} grow={2.6} seed={2.2} flow={0.07} />}
            {second && (
              <Wash className="splash-wash" drops={[{ ...SECOND, color: c2, alpha: 0.82 }]} grow={2.6} seed={5.1} flow={0.07} />
            )}
          </>
        ) : (
          // no WebGL: two soft blots that multiply where they overlap
          <>
            {first && <span className="splash-blot one" style={{ background: c1 }} />}
            {second && <span className="splash-blot two" style={{ background: c2 }} />}
          </>
        )}
      </div>
      <p className={word ? 'splash-word in' : 'splash-word'} aria-hidden="true">
        US
      </p>
      {/* the paint fades by the paper closing over it, not by draining out */}
      <span className="splash-veil" style={{ opacity: 1 - fade }} aria-hidden="true" />
    </div>
  );
}
