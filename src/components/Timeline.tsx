import { useRef } from 'react';
import { Link } from 'react-router-dom';
import { formatMemoryDate } from '../lib/format';
import { pool } from '../lib/washes';
import type { HistoryEntry, Memory, TimelineIntention } from '../lib/types';
import { t } from '../strings';
import { usePaint } from './Paper';
import Wash from './Wash';
import { PencilRule } from './Pencil';

type Entry =
  | { kind: 'memory'; date: string; at: string; memory: Memory; fromPlan: boolean }
  | { kind: 'intention'; date: string; at: string; intention: TimelineIntention }
  | { kind: 'history'; date: string; at: string; entry: HistoryEntry };

interface Props {
  memories: Memory[];
  intentions: TimelineIntention[];
  history: HistoryEntry[];
  /** colour of each person in this US; `me` first */
  colorOf: (userId: string | null) => string;
  together: string[];
  /** the wet drop at the head of the run (today); the paint starts there */
  head: React.RefObject<HTMLElement | null>;
}

const NOW = new Date();
const THIS_YEAR = String(NOW.getFullYear());

function yearsAgo(date: string) {
  return (NOW.getTime() - new Date(`${date}T00:00:00`).getTime()) / (365.25 * 864e5);
}

/** Newer memories are still wet; older ones have dried and faded a little. */
function wetness(date: string) {
  const y = yearsAgo(date);
  if (y < 1) return { flow: 0.05, strength: 1 };
  if (y < 2) return { flow: 0.012, strength: 0.75 };
  return { flow: 0, strength: 0.6 };
}

function shortDate(iso: string, precision: 'day' | 'month' | 'year') {
  const [y, m, d] = iso.split('-').map(Number);
  if (precision === 'year') return `${y}`;
  if (precision === 'month' || String(y) !== THIS_YEAR) return `${m}月`;
  return `${m}月${d}日`;
}

/**
 * The relationship's timeline as a run of paint flowing down the page: both people's colours
 * side by side, bleeding into each other. Each memory is a small pool where the paint gathered.
 * Newest at the top (still wet), older further down (drier, paler). Years are pencilled in.
 */
export default function Timeline({ memories, intentions, history, colorOf, together, head }: Props) {
  const planMemories = new Set(intentions.map((i) => i.memory_id).filter(Boolean));
  const entries: Entry[] = [
    ...memories.map((m) => ({
      kind: 'memory' as const,
      date: m.happened_on,
      at: m.created_at,
      memory: m,
      fromPlan: planMemories.has(m.id),
    })),
    ...intentions
      .filter((i) => !i.memory_id || !memories.some((m) => m.id === i.memory_id))
      .map((i) => ({ kind: 'intention' as const, date: i.done_at.slice(0, 10), at: i.done_at, intention: i })),
    ...history.map((h) => ({
      kind: 'history' as const,
      date: h.happened_on ?? h.created_at.slice(0, 10),
      at: h.created_at,
      entry: h,
    })),
  ].sort((a, b) => (a.date === b.date ? b.at.localeCompare(a.at) : b.date.localeCompare(a.date)));

  const box = useRef<HTMLDivElement>(null);
  const nodes = useRef<(HTMLElement | null)[]>([]);
  nodes.current.length = entries.length;

  // The run: from today's drop through every pool on screen, wobbling a little between them.
  usePaint(box, () => {
    const vh = window.innerHeight;
    const pts: [number, number, number, number][] = [];
    const add = (x: number, y: number, w: number, s: number) => pts.length < 16 && pts.push([x, y, w, s]);
    const h = head.current?.getBoundingClientRect();
    let prev: [number, number] | null = h ? [h.left + h.width / 2, h.top + h.height / 2 + 8] : null;
    let top = prev ? prev[1] : 0;
    if (prev && prev[1] > -400) add(prev[0], prev[1], 3, 1);
    entries.forEach((e, i) => {
      const el = nodes.current[i];
      if (!el) return;
      const r = el.getBoundingClientRect();
      const c: [number, number] = [r.left + r.width / 2, r.top + r.height / 2];
      if (!prev) top = c[1];
      const s = Math.max(0.4, 1 - yearsAgo(e.date) * 0.18);
      if (c[1] > -400 && (prev ? prev[1] : c[1]) < vh + 400) {
        if (prev) add((prev[0] + c[0]) / 2 + (i % 2 ? 6 : -6), (prev[1] + c[1]) / 2, 6.5, s);
        add(c[0], c[1], e.kind === 'history' ? 7 : 12, s);
      }
      prev = c;
    });
    if (prev && prev[1] < vh + 400) add(prev[0], prev[1] + 60, 2, 0.4);
    if (pts.length < 2) return null;
    return { ribbon: { c1: together[0], c2: together[1] ?? together[0], pts, top } };
  });

  let lastYear = THIS_YEAR;
  return (
    <div className="run" ref={box}>
      {entries.map((e, i) => {
        const year = e.date.slice(0, 4);
        const showYear = year !== lastYear;
        lastYear = year;
        const side = i % 2 ? 'left' : 'right';
        const key = `${e.kind}-${e.kind === 'memory' ? e.memory.id : e.kind === 'intention' ? e.intention.id : e.entry.id}`;
        const setNode = (el: HTMLElement | null) => {
          nodes.current[i] = el;
        };
        return (
          <div key={key} className="run-group">
            {showYear && (
              <div className="run-year">
                <span>{year}</span>
                <PencilRule />
              </div>
            )}
            {e.kind === 'memory' && (
              <Link to={`/us/${e.memory.us_id}/m/${e.memory.id}`} className={`run-row ${side}`}>
                <Wash
                  className="run-node pool"
                  drops={pool(e.fromPlan ? together : [colorOf(e.memory.author_id)])}
                  seed={i * 1.7 + 2}
                  {...wetness(e.date)}
                />
                <span ref={setNode} className="run-anchor" aria-hidden="true" />
                <span className="run-text">
                  <span className="run-date">
                    {shortDate(e.memory.happened_on, e.memory.happened_precision)}
                    <span className="sr-only">{formatMemoryDate(e.memory.happened_on, e.memory.happened_precision)}</span>
                  </span>
                  {e.memory.author_removed ? (
                    <span className="quiet">{t.memory.removedShell}</span>
                  ) : (
                    <span className="run-line">{e.memory.body.split('\n')[0] || e.memory.place}</span>
                  )}
                </span>
              </Link>
            )}
            {e.kind === 'intention' && (
              <div className={`run-row ${side}`}>
                <Wash className="run-node pool" drops={pool(together)} seed={i * 1.7 + 2} {...wetness(e.date)} />
                <span ref={setNode} className="run-anchor" aria-hidden="true" />
                <span className="run-text">
                  <span className="run-date">{shortDate(e.date, 'month')}</span>
                  <span className="run-line">{t.timeline.intentionDone(e.intention.body)}</span>
                </span>
              </div>
            )}
            {e.kind === 'history' && (
              <div className="run-row right stage">
                <span ref={setNode} className="run-node tick" aria-hidden="true">
                  <PencilRule />
                </span>
                <span className="run-text">
                  <span className="run-line pencil-text">{t.timeline.stageChange(e.entry.from_stage, e.entry.to_stage)}</span>
                  <span className="run-date">
                    {e.entry.happened_on ? shortDate(e.entry.happened_on, 'month') : t.about.historyUnknownDate}
                  </span>
                </span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
