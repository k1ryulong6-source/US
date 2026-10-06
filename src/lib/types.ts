export type UsState = 'active' | 'quiet' | 'closed';
export type UsPreset = 'family' | 'partners' | 'friends' | 'work' | 'other';
export type ProposalKind = 'rename' | 'relabel' | 'stage' | 'state';
export type ProposalStatus = 'pending' | 'applied' | 'declined' | 'withdrawn';
export type LeaveMode = 'keep' | 'remove';

export interface Profile {
  id: string;
  display_name: string;
}

export interface UsSpace {
  id: string;
  name: string;
  description: string;
  preset_label: UsPreset | null;
  stage: string | null;
  state: UsState;
}

export interface MyUsListItem extends UsSpace {
  sort_order: number;
  hidden: boolean;
}

export interface Member {
  user_id: string;
  joined_at: string;
  left_at: string | null;
  profiles: { display_name: string } | null;
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
