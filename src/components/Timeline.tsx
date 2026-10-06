import { formatDate, formatMemoryDate } from '../lib/format';
import type { HistoryEntry, Memory, TimelineIntention } from '../lib/types';
import { t } from '../strings';
import MemoryCard from './MemoryCard';

type Entry =
  | { kind: 'memory'; date: string; at: string; memory: Memory; fromPlan: boolean }
  | { kind: 'intention'; date: string; at: string; intention: TimelineIntention }
  | { kind: 'history'; date: string; at: string; entry: HistoryEntry };

/**
 * Reverse-chronological: memories, shared plans we did together, and
 * relationship stage changes. No counts, no stats.
 */
export default function Timeline({
  memories,
  intentions,
  history,
}: {
  memories: Memory[];
  intentions: TimelineIntention[];
  history: HistoryEntry[];
}) {
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

  let lastYear = '';
  return (
    <div className="timeline">
      {entries.map((e) => {
        const year = e.date.slice(0, 4);
        const divider = year !== lastYear ? <h3 className="year">{year}</h3> : null;
        lastYear = year;
        const key = `${e.kind}-${e.kind === 'memory' ? e.memory.id : e.kind === 'intention' ? e.intention.id : e.entry.id}`;
        return (
          <div key={key} className="stack-sm">
            {divider}
            {e.kind === 'memory' && (
              <>
                {e.fromPlan && <span className="quiet small">{t.timeline.fromPlan}</span>}
                <MemoryCard memory={e.memory} />
              </>
            )}
            {e.kind === 'intention' && (
              <p className="moment">
                <span className="quiet small">{formatDate(e.intention.done_at)}</span>
                <span>{t.timeline.intentionDone(e.intention.body)}</span>
              </p>
            )}
            {e.kind === 'history' && (
              <p className="moment">
                <span className="quiet small">
                  {e.entry.happened_on ? formatMemoryDate(e.entry.happened_on, 'day') : t.about.historyUnknownDate}
                </span>
                <span className="serif">{t.timeline.stageChange(e.entry.from_stage, e.entry.to_stage)}</span>
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
