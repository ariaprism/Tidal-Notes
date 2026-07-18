do $$
begin
  if (select count(*) from auth.users) <> 1 then
    raise exception 'Expected exactly one Tidal Notes auth user before securing access';
  end if;

  update auth.users
  set raw_app_meta_data = jsonb_set(
    coalesce(raw_app_meta_data, '{}'::jsonb),
    '{tidal_notes_access}',
    'true'::jsonb,
    true
  );
end
$$;

alter table public.entries enable row level security;
alter table public.messages enable row level security;

drop policy if exists "allow all" on public.entries;
drop policy if exists "allow all" on public.messages;

revoke all on table public.entries from anon;
revoke all on table public.messages from anon;
revoke all on table public.entries from authenticated;
revoke all on table public.messages from authenticated;

grant select, insert, update, delete on table public.entries to authenticated;
grant select, insert, update, delete on table public.messages to authenticated;

create policy "tidal member can read entries"
on public.entries
for select
to authenticated
using (
  ((select auth.jwt()) -> 'app_metadata' ->> 'tidal_notes_access') = 'true'
);

create policy "tidal member can add entries"
on public.entries
for insert
to authenticated
with check (
  ((select auth.jwt()) -> 'app_metadata' ->> 'tidal_notes_access') = 'true'
);

create policy "tidal member can update entries"
on public.entries
for update
to authenticated
using (
  ((select auth.jwt()) -> 'app_metadata' ->> 'tidal_notes_access') = 'true'
)
with check (
  ((select auth.jwt()) -> 'app_metadata' ->> 'tidal_notes_access') = 'true'
);

create policy "tidal member can delete entries"
on public.entries
for delete
to authenticated
using (
  ((select auth.jwt()) -> 'app_metadata' ->> 'tidal_notes_access') = 'true'
);

create policy "tidal member can read messages"
on public.messages
for select
to authenticated
using (
  ((select auth.jwt()) -> 'app_metadata' ->> 'tidal_notes_access') = 'true'
);

create policy "tidal member can add messages"
on public.messages
for insert
to authenticated
with check (
  ((select auth.jwt()) -> 'app_metadata' ->> 'tidal_notes_access') = 'true'
);

create policy "tidal member can update messages"
on public.messages
for update
to authenticated
using (
  ((select auth.jwt()) -> 'app_metadata' ->> 'tidal_notes_access') = 'true'
)
with check (
  ((select auth.jwt()) -> 'app_metadata' ->> 'tidal_notes_access') = 'true'
);

create policy "tidal member can delete messages"
on public.messages
for delete
to authenticated
using (
  ((select auth.jwt()) -> 'app_metadata' ->> 'tidal_notes_access') = 'true'
);
