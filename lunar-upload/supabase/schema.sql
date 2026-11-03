-- Lunar: скопируй ВЕСЬ файл в Supabase → SQL Editor → Run
-- Затем: Database → Replication → включи realtime для messages, conversation_members, user_gifts, profiles

create extension if not exists "pgcrypto";

-- ─── profiles ───────────────────────────────────────────────
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null check (username ~ '^[a-z0-9_]{3,24}$'),
  display_name text not null check (char_length(display_name) between 1 and 32),
  bio text not null default '',
  avatar_url text,
  banner_url text,
  accent text not null default '#7dd3fc',
  nft_username_id uuid,
  created_at timestamptz not null default now()
);

-- ─── NFT usernames ──────────────────────────────────────────
create table if not exists public.nft_usernames (
  id uuid primary key default gen_random_uuid(),
  handle text unique not null check (handle ~ '^[a-z0-9_]{2,20}$'),
  rarity text not null check (rarity in ('common','rare','epic','legendary')),
  gradient text not null,
  owner_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.profiles
  drop constraint if exists profiles_nft_username_id_fkey;
alter table public.profiles
  add constraint profiles_nft_username_id_fkey
  foreign key (nft_username_id) references public.nft_usernames(id) on delete set null;

-- ─── gifts catalog ──────────────────────────────────────────
create table if not exists public.gifts (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  emoji text not null,
  rarity text not null check (rarity in ('common','rare','epic','legendary')),
  description text not null default ''
);

create table if not exists public.gift_skins (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  palette text not null
);

create table if not exists public.gift_backgrounds (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  css text not null
);

create table if not exists public.user_gifts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  gift_id uuid not null references public.gifts(id),
  skin_id uuid references public.gift_skins(id),
  background_id uuid references public.gift_backgrounds(id),
  from_id uuid references public.profiles(id) on delete set null,
  note text not null default '',
  pinned boolean not null default false,
  created_at timestamptz not null default now()
);

-- ─── chats ──────────────────────────────────────────────────
create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now()
);

create table if not exists public.conversation_members (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  last_read_at timestamptz,
  primary key (conversation_id, user_id)
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text not null default '',
  gift_instance_id uuid references public.user_gifts(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists messages_conv_created_idx on public.messages (conversation_id, created_at);
create index if not exists user_gifts_owner_idx on public.user_gifts (owner_id);
create index if not exists conv_members_user_idx on public.conversation_members (user_id);

-- ─── auto profile ───────────────────────────────────────────
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, username, display_name)
  values (
    new.id,
    lower(coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1))),
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1))
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ─── helpers ────────────────────────────────────────────────
create or replace function public.get_or_create_dm(other uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  conv uuid;
begin
  if me is null then
    raise exception 'not authenticated';
  end if;
  if other = me then
    raise exception 'cannot chat with yourself';
  end if;

  select cm1.conversation_id into conv
  from public.conversation_members cm1
  join public.conversation_members cm2
    on cm1.conversation_id = cm2.conversation_id
  where cm1.user_id = me
    and cm2.user_id = other
  limit 1;

  if conv is not null then
    return conv;
  end if;

  insert into public.conversations default values returning id into conv;
  insert into public.conversation_members (conversation_id, user_id)
    values (conv, me), (conv, other);
  return conv;
end;
$$;

create or replace function public.claim_nft_username(uname uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then raise exception 'not authenticated'; end if;

  update public.nft_usernames
    set owner_id = me
    where id = uname and owner_id is null;

  if not found then
    raise exception 'username already taken';
  end if;

  update public.profiles
    set nft_username_id = uname
    where id = me;
end;
$$;

create or replace function public.equip_nft_username(uname uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then raise exception 'not authenticated'; end if;

  if uname is not null then
    if not exists (
      select 1 from public.nft_usernames where id = uname and owner_id = me
    ) then
      raise exception 'you do not own this username';
    end if;
  end if;

  update public.profiles set nft_username_id = uname where id = me;
end;
$$;

create or replace function public.mint_and_send_gift(
  to_user uuid,
  p_gift uuid,
  p_skin uuid,
  p_bg uuid,
  p_note text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  inst uuid;
  conv uuid;
begin
  if me is null then raise exception 'not authenticated'; end if;
  if to_user = me then raise exception 'send it to a friend'; end if;

  insert into public.user_gifts (owner_id, gift_id, skin_id, background_id, from_id, note)
  values (to_user, p_gift, p_skin, p_bg, me, coalesce(p_note, ''))
  returning id into inst;

  conv := public.get_or_create_dm(to_user);

  insert into public.messages (conversation_id, sender_id, body, gift_instance_id)
  values (conv, me, coalesce(nullif(p_note, ''), 'подарок'), inst);

  return inst;
end;
$$;

create or replace function public.is_member(conv uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.conversation_members
    where conversation_id = conv and user_id = auth.uid()
  );
$$;

-- ─── RLS ────────────────────────────────────────────────────
alter table public.profiles enable row level security;
alter table public.nft_usernames enable row level security;
alter table public.gifts enable row level security;
alter table public.gift_skins enable row level security;
alter table public.gift_backgrounds enable row level security;
alter table public.user_gifts enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;

drop policy if exists "profiles read" on public.profiles;
create policy "profiles read" on public.profiles for select to authenticated using (true);

drop policy if exists "profiles update self" on public.profiles;
create policy "profiles update self" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists "nft read" on public.nft_usernames;
create policy "nft read" on public.nft_usernames for select to authenticated using (true);

drop policy if exists "catalog gifts" on public.gifts;
create policy "catalog gifts" on public.gifts for select to authenticated using (true);

drop policy if exists "catalog skins" on public.gift_skins;
create policy "catalog skins" on public.gift_skins for select to authenticated using (true);

drop policy if exists "catalog bgs" on public.gift_backgrounds;
create policy "catalog bgs" on public.gift_backgrounds for select to authenticated using (true);

drop policy if exists "gifts read" on public.user_gifts;
create policy "gifts read" on public.user_gifts for select to authenticated using (true);

drop policy if exists "gifts pin own" on public.user_gifts;
create policy "gifts pin own" on public.user_gifts
  for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists "members read" on public.conversation_members;
create policy "members read" on public.conversation_members
  for select to authenticated
  using (public.is_member(conversation_id));

drop policy if exists "conv read" on public.conversations;
create policy "conv read" on public.conversations
  for select to authenticated
  using (public.is_member(id));

drop policy if exists "msg read" on public.messages;
create policy "msg read" on public.messages
  for select to authenticated
  using (public.is_member(conversation_id));

drop policy if exists "msg insert" on public.messages;
create policy "msg insert" on public.messages
  for insert to authenticated
  with check (sender_id = auth.uid() and public.is_member(conversation_id));

-- ─── storage ────────────────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true), ('banners', 'banners', true)
on conflict (id) do nothing;

drop policy if exists "avatar public read" on storage.objects;
create policy "avatar public read" on storage.objects
  for select using (bucket_id in ('avatars', 'banners'));

drop policy if exists "avatar own write" on storage.objects;
create policy "avatar own write" on storage.objects
  for insert to authenticated
  with check (
    bucket_id in ('avatars', 'banners')
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "avatar own update" on storage.objects;
create policy "avatar own update" on storage.objects
  for update to authenticated
  using (
    bucket_id in ('avatars', 'banners')
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "avatar own delete" on storage.objects;
create policy "avatar own delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id in ('avatars', 'banners')
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ─── seed NFT usernames ─────────────────────────────────────
insert into public.nft_usernames (handle, rarity, gradient) values
  ('lunar',     'legendary', 'linear-gradient(90deg,#fde68a,#f5d0fe,#7dd3fc)'),
  ('moon',      'legendary', 'linear-gradient(90deg,#e2e8f0,#fef9c3,#93c5fd)'),
  ('eclipse',   'epic',      'linear-gradient(90deg,#c4b5fd,#818cf8,#1e1b4b)'),
  ('aurora',    'epic',      'linear-gradient(90deg,#34d399,#22d3ee,#a78bfa)'),
  ('nova',      'epic',      'linear-gradient(90deg,#fb7185,#f97316,#fbbf24)'),
  ('galaxy',    'epic',      'linear-gradient(90deg,#818cf8,#c084fc,#f0abfc)'),
  ('comet',     'rare',      'linear-gradient(90deg,#67e8f9,#38bdf8,#818cf8)'),
  ('orbit',     'rare',      'linear-gradient(90deg,#93c5fd,#a5b4fc,#c4b5fd)'),
  ('cosmos',    'rare',      'linear-gradient(90deg,#a78bfa,#818cf8,#38bdf8)'),
  ('silver',    'rare',      'linear-gradient(90deg,#f8fafc,#cbd5e1,#94a3b8)'),
  ('star',      'common',    'linear-gradient(90deg,#fde68a,#fef08a,#fcd34d)'),
  ('dusk',      'common',    'linear-gradient(90deg,#fda4af,#c4b5fd,#818cf8)'),
  ('glow',      'common',    'linear-gradient(90deg,#f9a8d4,#fde68a,#86efac)'),
  ('tide',      'common',    'linear-gradient(90deg,#67e8f9,#2dd4bf,#38bdf8)'),
  ('night',     'common',    'linear-gradient(90deg,#94a3b8,#64748b,#1e293b)'),
  ('mist',      'common',    'linear-gradient(90deg,#e2e8f0,#cbd5e1,#94a3b8)'),
  ('ember',     'rare',      'linear-gradient(90deg,#fb923c,#f43f5e,#fbbf24)'),
  ('pearl',     'epic',      'linear-gradient(90deg,#fff7ed,#e2e8f0,#fbcfe8)')
on conflict (handle) do nothing;

-- ─── seed gifts ─────────────────────────────────────────────
insert into public.gifts (slug, name, emoji, rarity, description) values
  ('moon',    'Луна',      '🌙', 'legendary', 'Светится в ночном чате'),
  ('star',    'Звезда',    '⭐', 'rare',      'Тёплое сияние'),
  ('rose',    'Роза',      '🌹', 'common',    'Классика подарков'),
  ('bear',    'Мишка',     '🧸', 'rare',      'Мягкий и дорогой вид'),
  ('rocket',  'Ракета',    '🚀', 'epic',      'Улетает к друзьям'),
  ('heart',   'Сердце',    '💜', 'common',    'Просто любовь'),
  ('crown',   'Корона',    '👑', 'legendary', 'Для особенных'),
  ('crystal', 'Кристалл',  '💎', 'epic',      'Холодный блеск'),
  ('cake',    'Торт',      '🎂', 'common',    'На любой день'),
  ('fire',    'Огонь',     '🔥', 'rare',      'Горячий скин'),
  ('ghost',   'Призрак',   '👻', 'rare',      'Полупрозрачный вайб'),
  ('cat',     'Котик',     '🐱', 'common',    'Обязательный подарок')
on conflict (slug) do nothing;

insert into public.gift_skins (slug, name, palette) values
  ('classic', 'Классика',  '#e2e8f0,#94a3b8'),
  ('gold',    'Золото',    '#fde68a,#f59e0b'),
  ('neon',    'Неон',      '#22d3ee,#a855f7'),
  ('ice',     'Лёд',       '#e0f2fe,#38bdf8'),
  ('sunset',  'Закат',     '#fb7185,#fb923c'),
  ('galaxy',  'Галактика', '#818cf8,#f0abfc'),
  ('obsidian','Обсидиан',  '#0f172a,#64748b'),
  ('mint',    'Мята',      '#6ee7b7,#14b8a6')
on conflict (slug) do nothing;

insert into public.gift_backgrounds (slug, name, css) values
  ('void',    'Пустота',     'radial-gradient(circle at 30% 20%, #1e293b, #020617 70%)'),
  ('stars',   'Звёзды',      'radial-gradient(circle at 20% 20%, #312e81, #020617 55%)'),
  ('aurora',  'Сияние',      'linear-gradient(160deg, #042f2e, #1e1b4b 50%, #0f172a)'),
  ('marble',  'Мрамор',      'linear-gradient(135deg, #334155, #0f172a 40%, #1e293b)'),
  ('city',    'Ночной город','linear-gradient(180deg, #0f172a, #1e3a8a 80%, #0ea5e9)'),
  ('rose',    'Розовый пыль','radial-gradient(circle at 70% 30%, #4c1d95, #0f172a)'),
  ('golddust','Золотая пыль','radial-gradient(circle at 50% 0%, #78350f, #0f172a 60%)'),
  ('ocean',   'Океан',       'linear-gradient(180deg, #082f49, #164e63, #0f172a)')
on conflict (slug) do nothing;

grant execute on function public.get_or_create_dm(uuid) to authenticated;
grant execute on function public.claim_nft_username(uuid) to authenticated;
grant execute on function public.equip_nft_username(uuid) to authenticated;
grant execute on function public.mint_and_send_gift(uuid, uuid, uuid, uuid, text) to authenticated;
grant execute on function public.is_member(uuid) to authenticated;

do $$
begin
  begin alter publication supabase_realtime add table public.messages; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.user_gifts; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.profiles; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.conversation_members; exception when duplicate_object then null; end;
end $$;
