create extension if not exists pgcrypto;

create type provider_key as enum ('cloudflare-pages','vercel','koyeb','zeabur','northflank','bot-host','manual');
create type deployment_status as enum ('queued','building','live','failed','rolled_back','paused');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique not null,
  display_name text,
  two_factor_enabled boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.provider_credentials (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  provider provider_key not null,
  encrypted_payload bytea not null,
  iv bytea not null,
  status text not null default 'unchecked',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, provider)
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  slug text not null,
  source_type text not null check (source_type in ('github','zip')),
  source_ref text,
  framework text,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  unique(owner_id, slug)
);

create table public.deployments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  provider provider_key not null,
  status deployment_status not null default 'queued',
  url text,
  install_command text,
  build_command text,
  start_command text,
  output_directory text,
  runtime text,
  commit_sha text,
  build_duration_ms integer,
  created_at timestamptz not null default now()
);

create table public.deployment_logs (
  id bigserial primary key,
  deployment_id uuid not null references public.deployments(id) on delete cascade,
  level text not null,
  message text not null,
  created_at timestamptz not null default now()
);

create table public.audit_logs (
  id bigserial primary key,
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  target text,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.provider_credentials enable row level security;
alter table public.projects enable row level security;
alter table public.deployments enable row level security;
alter table public.deployment_logs enable row level security;
alter table public.audit_logs enable row level security;

create policy "profiles own row" on public.profiles for all using (auth.uid() = id);
create policy "credentials own row" on public.provider_credentials for all using (auth.uid() = user_id);
create policy "projects own row" on public.projects for all using (auth.uid() = owner_id);
create policy "deployments through project" on public.deployments for all using (
  exists (select 1 from public.projects p where p.id = project_id and p.owner_id = auth.uid())
);
create policy "logs through deployment" on public.deployment_logs for select using (
  exists (select 1 from public.deployments d join public.projects p on p.id = d.project_id where d.id = deployment_id and p.owner_id = auth.uid())
);
