-- Two kinds of photo outside memories:
--   avatars/{user}/{file}  a person's own photo, seen by the people they share a US with
--   covers/{us}/{file}     a relationship's photo; any current member may change it,
--                          everyone in the US sees the same one, and who changed it is not kept

alter table public.profiles
  add column avatar_path text check (avatar_path is null or avatar_path like 'avatars/' || id::text || '/%');
grant update (avatar_path) on public.profiles to authenticated;

alter table public.us_spaces
  add column cover_path text check (cover_path is null or cover_path like 'covers/' || id::text || '/%');

create function public.set_us_cover(p_us uuid, p_path text)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not private.is_active_member(p_us) then
    raise exception 'not a member' using errcode = '42501';
  end if;
  if not private.us_is_open(p_us) then
    raise exception 'this US is closed' using errcode = '42501';
  end if;
  update public.us_spaces set cover_path = nullif(p_path, '') where id = p_us;
end;
$$;
revoke all on function public.set_us_cover(uuid, text) from public;
grant execute on function public.set_us_cover(uuid, text) to authenticated;

-- Upload: your own avatar folder; or the cover folder of an open US you are in.
create function private.photo_upload_allowed(p_name text)
returns boolean
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_parts text[] := string_to_array(p_name, '/');
  v_id    uuid;
begin
  if array_length(v_parts, 1) <> 3 or v_parts[3] = '' then
    return false;
  end if;
  begin
    v_id := v_parts[2]::uuid;
  exception when others then
    return false;
  end;
  if v_parts[1] = 'avatars' then
    return v_id = auth.uid();
  elsif v_parts[1] = 'covers' then
    return private.is_active_member(v_id) and private.us_is_open(v_id);
  end if;
  return false;
end;
$$;

-- Read: only the photo currently in use, and only by people who may see it.
create function private.photo_read_allowed(p_name text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.profiles p
                 where p.avatar_path = p_name and private.can_see_profile(p.id))
      or exists (select 1 from public.us_spaces s
                 where s.cover_path = p_name and private.is_active_member(s.id));
$$;

revoke all on function private.photo_upload_allowed(text), private.photo_read_allowed(text) from public;
grant execute on function private.photo_upload_allowed(text), private.photo_read_allowed(text) to authenticated;

create policy "media: upload avatar or cover" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'media' and private.photo_upload_allowed(name));

create policy "media: read avatar or cover" on storage.objects
  for select to authenticated
  using (bucket_id = 'media' and private.photo_read_allowed(name));
