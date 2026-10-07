import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { colorOf } from '../lib/palette';
import type { Prompt } from '../lib/types';
import { t } from '../strings';
import WetDrop from './WetDrop';

/**
 * One gentle question per person per week: a drop of your own colour, not yet fallen.
 * No streaks, no reminders here.
 */
export default function WeeklyQuestion() {
  const { session, profile } = useAuth();
  const [prompt, setPrompt] = useState<Prompt | null>(null);

  useEffect(() => {
    supabase.rpc('my_weekly_prompt').then(({ data }) => setPrompt(((data as Prompt[]) ?? [])[0] ?? null));
  }, []);

  if (!prompt || !session) return null;
  return (
    <Link to={`/answer?prompt=${prompt.id}`} className="question">
      <WetDrop color={colorOf(session.user.id, profile?.color)} size={26} />
      <span className="question-text">
        <span className="sr-only">{t.question.label}：</span>
        <span className="question-body">{prompt.body}</span>
      </span>
    </Link>
  );
}
