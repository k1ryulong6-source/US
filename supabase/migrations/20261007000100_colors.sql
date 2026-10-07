-- Each person picks one pigment. It is how they appear in every US they belong to:
-- their part of a shared wash, the flecks they leave on others, the drop on their own page.
-- null = not chosen yet; the app then derives a stable default from the user id.

alter table public.profiles
  add column color text check (color in (
    '#E2B21F', '#E58A2E', '#D2493C', '#D9677A', '#E3A0AE', '#B0508A', '#7D5FA8',
    '#2779BE', '#5BA8D8', '#3E9C9A', '#6E9A57', '#A3A23A', '#C9852E', '#7A5A44'
  ));

-- Readable wherever the profile already is (co-members only); writable only by its owner,
-- through the existing "profiles: edit own" policy.
grant update (color) on public.profiles to authenticated;
