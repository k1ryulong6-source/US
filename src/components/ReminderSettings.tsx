import { useEffect, useState } from 'react';
import {
  VAPID_PUBLIC_KEY,
  disableReminder,
  enableReminder,
  isIos,
  isStandalone,
  loadReminder,
  pushSupported,
  type ReminderSettings as Settings,
} from '../lib/push';
import { t } from '../strings';

const HOURS = [8, 12, 18, 20, 21, 22];

/** Opt-in, at most once a week. The app works fully without it. */
export default function ReminderSettings() {
  const [current, setCurrent] = useState<Settings | null | undefined>(undefined);
  const [weekday, setWeekday] = useState(0);
  const [hour, setHour] = useState(20);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!VAPID_PUBLIC_KEY || !pushSupported()) return setCurrent(null);
    loadReminder()
      .then(setCurrent)
      .catch(() => setCurrent(null));
  }, []);

  if (!VAPID_PUBLIC_KEY || current === undefined) return null;

  let blocked: string | null = null;
  if (isIos() && !isStandalone()) blocked = t.reminder.iosHint;
  else if (!pushSupported()) blocked = t.reminder.unsupported;

  async function turnOn() {
    setBusy(true);
    setProblem(null);
    const result = await enableReminder({ weekday, hour });
    setBusy(false);
    if (result === 'denied') return setProblem(t.reminder.denied);
    if (result === 'error') return setProblem(t.common.somethingWrong);
    setCurrent({ weekday, hour });
  }

  async function turnOff() {
    setBusy(true);
    await disableReminder();
    setBusy(false);
    setCurrent(null);
  }

  return (
    <section className="paper stack-sm">
      <h2 className="subtitle">{t.reminder.title}</h2>
      <p className="quiet small">{t.reminder.intro}</p>
      {blocked ? (
        <p className="quiet small">{blocked}</p>
      ) : current ? (
        <>
          <p className="small">{t.reminder.isOn(t.reminder.days[current.weekday], current.hour)}</p>
          <button className="link" disabled={busy} onClick={turnOff}>
            {t.reminder.off}
          </button>
        </>
      ) : (
        <>
          <div className="field">
            <span>{t.reminder.day}</span>
            <div className="chips">
              {t.reminder.days.map((d, i) => (
                <button key={d} type="button" className={weekday === i ? 'chip on' : 'chip'} onClick={() => setWeekday(i)}>
                  {d}
                </button>
              ))}
            </div>
          </div>
          <div className="field">
            <span>{t.reminder.hour}</span>
            <div className="chips">
              {HOURS.map((h) => (
                <button key={h} type="button" className={hour === h ? 'chip on' : 'chip'} onClick={() => setHour(h)}>
                  {h}:00
                </button>
              ))}
            </div>
          </div>
          <button className="secondary self-start" disabled={busy} onClick={turnOn}>
            {t.reminder.on}
          </button>
        </>
      )}
      {problem && <p className="quiet small">{problem}</p>}
    </section>
  );
}
