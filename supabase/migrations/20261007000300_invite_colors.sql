-- The invite page shows the paint of the people already in the US, with an empty pencilled
-- place for the newcomer. So the preview now carries each member's colour.
-- People who haven't chosen one get the same stable default the app derives from their id
-- (FNV-1a over the id's text, modulo the palette, exactly as src/lib/palette.ts does).

create function private.default_color(p_user uuid)
returns text
language plpgsql immutable set search_path = ''
as $$
declare
  v_palette text[] := array[
    '#E2B21F', '#E58A2E', '#D2493C', '#D9677A', '#E3A0AE', '#B0508A', '#7D5FA8',
    '#2779BE', '#5BA8D8', '#3E9C9A', '#6E9A57', '#A3A23A', '#C9852E', '#7A5A44'
  ];
  v_text text := p_user::text;
  v_hash bigint := 2166136261;
begin
  for i in 1 .. length(v_text) loop
    v_hash := ((v_hash # ascii(substr(v_text, i, 1))) * 16777619) % 4294967296;
  end loop;
  return v_palette[(v_hash % array_length(v_palette, 1)) + 1];
end;
$$;
revoke all on function private.default_color(uuid) from public;

drop function public.invitation_preview(text);
create function public.invitation_preview(p_token text)
returns table (us_name text, member_names text[], member_colors text[])
language sql stable security definer set search_path = ''
as $$
  select s.name,
         array(
           select p.display_name from public.us_members m
           join public.profiles p on p.id = m.user_id
           where m.us_id = s.id and m.left_at is null and p.display_name <> ''
           order by m.joined_at
         ),
         array(
           select coalesce(p.color, private.default_color(p.id)) from public.us_members m
           join public.profiles p on p.id = m.user_id
           where m.us_id = s.id and m.left_at is null
           order by m.joined_at
         )
  from public.invitations i
  join public.us_spaces s on s.id = i.us_id
  where i.token_hash = private.hash_token(p_token)
    and i.used_at is null and i.revoked_at is null and i.expires_at > now()
    and s.state <> 'closed';
$$;
revoke all on function public.invitation_preview(text) from public;
grant execute on function public.invitation_preview(text) to anon, authenticated;
