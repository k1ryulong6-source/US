export type UsState = 'active' | 'quiet' | 'closed';
export type UsPreset = 'family' | 'partners' | 'friends' | 'work' | 'other';
export type ProposalKind = 'rename' | 'relabel' | 'stage' | 'state';
export type ProposalStatus = 'pending' | 'applied' | 'declined' | 'withdrawn';
export type LeaveMode = 'keep' | 'remove';

export interface Profile {
  id: string;
  display_name: string;
  /** one of PALETTE; null until chosen */
  color?: string | null;
  avatar_path?: string | null;
}

/** What a page needs to know about a person to paint them. */
export interface PersonRef {
  display_name: string;
  color?: string | null;
  avatar_path?: string | null;
}

export interface UsSpace {
  id: string;
  name: string;
  description: string;
  preset_label: UsPreset | null;
  stage: string | null;
  state: UsState;
  cover_path?: string | null;
}

export interface MyUsListItem extends UsSpace {
  sort_order: number;
  hidden: boolean;
}

export interface Member {
  user_id: string;
  joined_at: string;
  left_at: string | null;
  profiles: PersonRef | null;
}

export interface Invitation {
  id: string;
  created_at: string;
  expires_at: string;
  used_at: string | null;
  revoked_at: string | null;
}

export interface Proposal {
  id: string;
  kind: ProposalKind;
  payload: Record<string, string | null>;
  proposed_by: string | null;
  status: ProposalStatus;
  created_at: string;
  resolved_at: string | null;
}

export interface HistoryEntry {
  id: string;
  from_stage: string | null;
  to_stage: string | null;
  happened_on: string | null;
  created_at: string;
}

export type DatePrecision = 'day' | 'month' | 'year';
export type MediaKind = 'image' | 'audio';

export interface Memory {
  id: string;
  us_id: string;
  author_id: string | null;
  body: string;
  happened_on: string;
  happened_precision: DatePrecision;
  place: string;
  author_removed: boolean;
  created_at: string;
  profiles?: PersonRef | null;
  memory_media?: MemoryMedia[];
}

export interface MemoryMedia {
  id: string;
  memory_id: string;
  kind: MediaKind;
  storage_path: string;
  mime: string;
  width: number | null;
  height: number | null;
  duration_ms: number | null;
  position: number;
}

export interface Perspective {
  id: string;
  memory_id: string;
  author_id: string;
  body: string;
  is_private: boolean;
  audio_path: string | null;
  audio_mime: string | null;
  audio_duration_ms: number | null;
  created_at: string;
  profiles?: PersonRef | null;
}

export interface SeenNote {
  id: string;
  us_id: string;
  from_id: string;
  to_id: string;
  body: string;
  created_at: string;
}

export type PromptKind = 'general' | 'seen';
export type IntentionVisibility = 'private' | 'shared';
export type IntentionStatus = 'open' | 'done' | 'let_go';

export interface Prompt {
  id: number;
  body: string;
  kind: PromptKind;
}

export interface Intention {
  id: string;
  us_id: string;
  author_id: string;
  body: string;
  visibility: IntentionVisibility;
  status: IntentionStatus;
  done_at: string | null;
  memory_id: string | null;
  done_note: string | null;
  prompt_id: number | null;
  created_at: string;
  us_spaces?: { name: string } | null;
}

export interface TimelineIntention {
  id: string;
  body: string;
  done_at: string;
  memory_id: string | null;
  created_at: string;
}
