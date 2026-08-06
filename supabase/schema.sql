-- Execute este script no SQL Editor do seu projeto Supabase
-- (https://app.supabase.com/project/_/sql/new)
--
-- Cria a tabela usada pelo app para guardar os dados de cada usuário
-- e habilita Row Level Security para que cada usuário só acesse os
-- próprios registros.

create table if not exists public.timesheet_data (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  entries    jsonb not null default '[]'::jsonb,
  hours_goal jsonb not null default '{}'::jsonb,
  dark_mode  boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.timesheet_data enable row level security;

drop policy if exists "Usuários leem os próprios dados" on public.timesheet_data;
create policy "Usuários leem os próprios dados"
  on public.timesheet_data for select
  using (auth.uid() = user_id);

drop policy if exists "Usuários inserem os próprios dados" on public.timesheet_data;
create policy "Usuários inserem os próprios dados"
  on public.timesheet_data for insert
  with check (auth.uid() = user_id);

drop policy if exists "Usuários atualizam os próprios dados" on public.timesheet_data;
create policy "Usuários atualizam os próprios dados"
  on public.timesheet_data for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Usuários apagam os próprios dados" on public.timesheet_data;
create policy "Usuários apagam os próprios dados"
  on public.timesheet_data for delete
  using (auth.uid() = user_id);
