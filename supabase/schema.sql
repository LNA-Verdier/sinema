-- Ciné à deux : schéma Supabase
-- À exécuter une fois dans Supabase → SQL Editor → New query → Run.
-- Prérequis : Authentication → Sign In / Providers → "Allow anonymous sign-ins" activé.

-- ---------- Tables ----------
create table if not exists public.rooms (
  id         uuid primary key default gen_random_uuid(),
  code       text unique not null,
  created_at timestamptz not null default now()
);

create table if not exists public.members (
  room_id    uuid not null references public.rooms(id) on delete cascade,
  user_id    uuid not null default auth.uid(),
  name       text not null check (char_length(name) between 1 and 24),
  joined_at  timestamptz not null default now(),
  primary key (room_id, user_id)
);

-- Un swipe par personne et par film. verdict : like (envie), nope (bof), seen (déjà vu).
-- movie garde un instantané du film (titre, affiche, année…) pour afficher les matchs sans rappeler TMDB.
create table if not exists public.swipes (
  room_id    uuid not null references public.rooms(id) on delete cascade,
  user_id    uuid not null default auth.uid(),
  movie_id   integer not null,
  verdict    text not null check (verdict in ('like','nope','seen')),
  movie      jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  primary key (room_id, user_id, movie_id)
);

-- Films de la liste commune marqués « vu ensemble ».
create table if not exists public.watched (
  room_id    uuid not null references public.rooms(id) on delete cascade,
  movie_id   integer not null,
  marked_by  uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  primary key (room_id, movie_id)
);

-- ---------- Appartenance à un salon ----------
create or replace function public.is_member(r uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from members where room_id = r and user_id = auth.uid());
$$;

-- Créer un salon : renvoie son code à partager (6 caractères sans ambiguïté).
create or replace function public.create_room(p_name text)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_code text; v_room uuid;
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  loop
    v_code := '';
    for i in 1..6 loop
      v_code := v_code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from rooms where code = v_code);
  end loop;
  insert into rooms(code) values (v_code) returning id into v_room;
  insert into members(room_id, user_id, name) values (v_room, auth.uid(), trim(p_name));
  return v_code;
end $$;

-- Rejoindre un salon avec son code (ou mettre à jour son prénom si on y est déjà).
create or replace function public.join_room(p_code text, p_name text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_room uuid;
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  select id into v_room from rooms where code = upper(trim(p_code));
  if v_room is null then raise exception 'room_not_found'; end if;
  insert into members(room_id, user_id, name) values (v_room, auth.uid(), trim(p_name))
    on conflict (room_id, user_id) do update set name = excluded.name;
  return v_room;
end $$;

grant execute on function public.create_room(text), public.join_room(text, text), public.is_member(uuid) to authenticated;

-- ---------- Règles d'accès (RLS) ----------
alter table public.rooms   enable row level security;
alter table public.members enable row level security;
alter table public.swipes  enable row level security;
alter table public.watched enable row level security;

drop policy if exists "rooms: membres" on public.rooms;
create policy "rooms: membres" on public.rooms for select to authenticated using (is_member(id));

drop policy if exists "members: lecture" on public.members;
create policy "members: lecture" on public.members for select to authenticated using (is_member(room_id));

drop policy if exists "swipes: lecture" on public.swipes;
create policy "swipes: lecture" on public.swipes for select to authenticated using (is_member(room_id));
drop policy if exists "swipes: ajout" on public.swipes;
create policy "swipes: ajout" on public.swipes for insert to authenticated with check (user_id = auth.uid() and is_member(room_id));
drop policy if exists "swipes: modif" on public.swipes;
create policy "swipes: modif" on public.swipes for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid() and is_member(room_id));
drop policy if exists "swipes: suppression" on public.swipes;
create policy "swipes: suppression" on public.swipes for delete to authenticated using (user_id = auth.uid());

drop policy if exists "watched: lecture" on public.watched;
create policy "watched: lecture" on public.watched for select to authenticated using (is_member(room_id));
drop policy if exists "watched: ajout" on public.watched;
create policy "watched: ajout" on public.watched for insert to authenticated with check (is_member(room_id));
drop policy if exists "watched: suppression" on public.watched;
create policy "watched: suppression" on public.watched for delete to authenticated using (is_member(room_id));

-- ---------- Temps réel ----------
do $$ begin
  begin alter publication supabase_realtime add table public.swipes;  exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.watched; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.members; exception when duplicate_object then null; end;
end $$;
-- Les suppressions doivent transporter room_id pour être filtrées côté client.
alter table public.swipes  replica identity full;
alter table public.watched replica identity full;
