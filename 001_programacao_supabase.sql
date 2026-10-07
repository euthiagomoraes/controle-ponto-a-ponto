-- Rev. 13: persistência da programação e controle de edição pelo Técnico
create extension if not exists pgcrypto;

create table if not exists public.tb_atividades (
  id text primary key,
  nome text not null,
  descricao text,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tb_atividade_colunas (
  id text primary key,
  atividade_id text not null references public.tb_atividades(id) on delete cascade,
  chave text not null,
  rotulo text not null,
  tipo text not null default 'text',
  obrigatorio boolean not null default false,
  editavel_tecnico boolean not null default false,
  opcoes jsonb not null default '[]'::jsonb,
  ordem integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (atividade_id, chave)
);

create table if not exists public.tb_programacoes (
  id uuid primary key default gen_random_uuid(),
  week text not null,
  date date,
  activity_id text not null references public.tb_atividades(id),
  team text,
  responsible text,
  qty numeric not null default 0,
  note text,
  custom_data jsonb not null default '{}'::jsonb,
  import_mode text not null default 'append',
  import_file text,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_tb_programacoes_week on public.tb_programacoes(week);
create index if not exists idx_tb_programacoes_activity on public.tb_programacoes(activity_id);

alter table public.tb_atividades enable row level security;
alter table public.tb_atividade_colunas enable row level security;
alter table public.tb_programacoes enable row level security;

-- Para o aplicativo com Supabase Auth: usuários autenticados podem consultar.
-- Escrita administrativa deve ser restringida posteriormente à sua função de ADMINISTRADOR.
drop policy if exists "auth read atividades" on public.tb_atividades;
create policy "auth read atividades" on public.tb_atividades for select to authenticated using (true);
drop policy if exists "auth read atividade colunas" on public.tb_atividade_colunas;
create policy "auth read atividade colunas" on public.tb_atividade_colunas for select to authenticated using (true);
drop policy if exists "auth read programacoes" on public.tb_programacoes;
create policy "auth read programacoes" on public.tb_programacoes for select to authenticated using (true);
drop policy if exists "auth insert programacoes" on public.tb_programacoes;
create policy "auth insert programacoes" on public.tb_programacoes for insert to authenticated with check (true);
drop policy if exists "auth update programacoes" on public.tb_programacoes;
create policy "auth update programacoes" on public.tb_programacoes for update to authenticated using (true) with check (true);


-- Rev. 13 local/demo: o frontend atual usa código de acesso local em vez de Supabase Auth.
-- Remova estas policies quando o login estiver 100% migrado para Supabase Auth.
drop policy if exists "anon read atividades" on public.tb_atividades;
create policy "anon read atividades" on public.tb_atividades for select to anon using (true);
drop policy if exists "anon read atividade colunas" on public.tb_atividade_colunas;
create policy "anon read atividade colunas" on public.tb_atividade_colunas for select to anon using (true);
drop policy if exists "anon read programacoes" on public.tb_programacoes;
create policy "anon read programacoes" on public.tb_programacoes for select to anon using (true);
drop policy if exists "anon insert programacoes" on public.tb_programacoes;
create policy "anon insert programacoes" on public.tb_programacoes for insert to anon with check (true);
drop policy if exists "anon update programacoes" on public.tb_programacoes;
create policy "anon update programacoes" on public.tb_programacoes for update to anon using (true) with check (true);
drop policy if exists "anon delete programacoes" on public.tb_programacoes;
create policy "anon delete programacoes" on public.tb_programacoes for delete to anon using (true);
drop policy if exists "anon write atividades" on public.tb_atividades;
create policy "anon write atividades" on public.tb_atividades for all to anon using (true) with check (true);
drop policy if exists "anon write atividade colunas" on public.tb_atividade_colunas;
create policy "anon write atividade colunas" on public.tb_atividade_colunas for all to anon using (true) with check (true);
