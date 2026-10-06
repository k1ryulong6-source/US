import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import type { Prompt } from '../lib/types';
import { t } from '../strings';

/** One gentle question per person per week. No streaks, no reminders here. */
export default function WeeklyQuestion() {
  const [prompt, setPrompt] = useState<Prompt | null>(null);

  useEffect(() => {
    supabase.rpc('my_weekly_prompt').then(({ data }) => setPrompt(((data as Prompt[]) ?? [])[0] ?? null));
  }, []);

  if (!prompt) return null;
  return (
    <section className="question">
      <span className="quiet small">{t.question.label}</span>
      <p className="question-body">{prompt.body}</p>
      <Link to={`/answer?prompt=${prompt.id}`} className="link">
        {prompt.kind === 'seen' ? t.question.answerSeen : t.question.answer}
      </Link>
    </section>
  );
}
