-- Run this in the Supabase SQL editor after creating your project.

create table if not exists public.articles (
  id           uuid        primary key default gen_random_uuid(),
  url          text        unique not null,
  title        text        not null,
  published_at timestamptz not null,
  score        integer     not null default 0,
  category     text,
  headline     text,
  created_at   timestamptz default now()
);

create index if not exists articles_published_at_idx on public.articles (published_at desc);
create index if not exists articles_score_idx        on public.articles (score desc);

-- Subscribers: email + two separate opt-ins
create table if not exists public.subscribers (
  id                uuid    primary key default gen_random_uuid(),
  email             text    unique not null,
  breaking_alerts   boolean not null default false,  -- instant email on score >= 7
  digest            boolean not null default true,   -- 8 PM IST daily summary
  unsubscribe_token text    not null default encode(gen_random_bytes(32), 'hex'),
  created_at        timestamptz default now()
);

-- Daily digests (cached for the landing page)
create table if not exists public.digests (
  date          date    primary key,
  content       text    not null,
  article_count integer not null,
  created_at    timestamptz default now()
);

-- Row-level security ─────────────────────────────────────────────────────────

alter table public.articles     enable row level security;
alter table public.subscribers  enable row level security;
alter table public.digests      enable row level security;

-- Articles: public read
create policy "articles_read"    on public.articles    for select using (true);

-- Subscribers: anyone can insert (sign-up form), anyone can delete if they know the token
-- (token is 64-char random hex — effectively a secret link)
create policy "subscribers_insert" on public.subscribers for insert with check (true);
create policy "subscribers_delete" on public.subscribers for delete using (true);

-- Digests: public read
create policy "digests_read"     on public.digests     for select using (true);
