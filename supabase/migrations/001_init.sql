-- Book de Requisições — Versão 01
-- PostgreSQL / Supabase

create extension if not exists pgcrypto;

create type public.status_requisicao as enum (
  'Programada','Em execução','Executada','Pendente','Atrasada','Bloqueada','Reprogramada','Cancelada'
);

create table if not exists public.disciplinas (
  id uuid primary key default gen_random_uuid(),
  codigo text unique not null,
  nome text not null,
  descricao text,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.equipes (
  id uuid primary key default gen_random_uuid(),
  codigo text unique not null,
  nome text not null,
  disciplina_id uuid not null references public.disciplinas(id),
  responsavel_funcionario_id uuid,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.funcionarios (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique,
  matricula text unique not null,
  nome text not null,
  email text,
  telefone text,
  equipe_id uuid references public.equipes(id),
  disciplina_id uuid references public.disciplinas(id),
  funcao text,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.equipes
  drop constraint if exists equipes_responsavel_funcionario_id_fkey;
alter table public.equipes
  add constraint equipes_responsavel_funcionario_id_fkey
  foreign key (responsavel_funcionario_id) references public.funcionarios(id);

create table if not exists public.tipos_atividade (
  id uuid primary key default gen_random_uuid(),
  nome text unique not null,
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.atividades (
  id uuid primary key default gen_random_uuid(),
  codigo text unique not null,
  nome text not null,
  tipo_id uuid references public.tipos_atividade(id),
  disciplina_id uuid references public.disciplinas(id),
  tag_prefixo text,
  area text,
  sistema text,
  descricao text,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.programacoes (
  id uuid primary key default gen_random_uuid(),
  chave_negocio text unique not null,
  origem text not null default 'manual',
  arquivo_origem text,
  requisicao text,
  data_programada date not null,
  atividade_id uuid references public.atividades(id),
  tag text not null,
  disciplina_id uuid references public.disciplinas(id),
  equipe_id uuid references public.equipes(id),
  responsavel_funcionario_id uuid references public.funcionarios(id),
  status public.status_requisicao not null default 'Programada',
  observacoes text,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.execucoes (
  id uuid primary key default gen_random_uuid(),
  programacao_id uuid not null references public.programacoes(id),
  funcionario_id uuid references public.funcionarios(id),
  inicio_real timestamptz,
  fim_real timestamptz,
  status public.status_requisicao not null default 'Em execução',
  resultado text,
  observacoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.execucao_fotos (
  id uuid primary key default gen_random_uuid(),
  execucao_id uuid not null references public.execucoes(id) on delete cascade,
  storage_path text not null,
  file_name text,
  created_by uuid,
  created_at timestamptz not null default now()
);

create table if not exists public.ocorrencias (
  id uuid primary key default gen_random_uuid(),
  execucao_id uuid references public.execucoes(id) on delete cascade,
  tipo text not null,
  descricao text not null,
  created_by uuid,
  created_at timestamptz not null default now()
);

create table if not exists public.reprogramacoes (
  id uuid primary key default gen_random_uuid(),
  programacao_id uuid not null references public.programacoes(id),
  data_anterior date not null,
  nova_data date not null,
  motivo text not null,
  criado_por uuid,
  created_at timestamptz not null default now()
);

create table if not exists public.importacoes (
  id uuid primary key default gen_random_uuid(),
  nome_arquivo text not null,
  storage_path text,
  status text not null default 'validando',
  total_linhas integer not null default 0,
  novas integer not null default 0,
  alteradas integer not null default 0,
  duplicadas integer not null default 0,
  erros integer not null default 0,
  usuario_id uuid,
  created_at timestamptz not null default now(),
  concluido_at timestamptz
);

create table if not exists public.importacao_itens (
  id uuid primary key default gen_random_uuid(),
  importacao_id uuid not null references public.importacoes(id) on delete cascade,
  linha integer not null,
  chave_negocio text,
  acao text not null,
  mensagem text,
  dados jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.historico_status (
  id uuid primary key default gen_random_uuid(),
  programacao_id uuid not null references public.programacoes(id) on delete cascade,
  status_anterior public.status_requisicao,
  status_novo public.status_requisicao not null,
  motivo text,
  usuario_id uuid,
  created_at timestamptz not null default now()
);

create table if not exists public.auditoria (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid,
  acao text not null,
  modulo text not null,
  registro_id text,
  dados_anteriores jsonb,
  dados_novos jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.perfis_acesso (
  id uuid primary key default gen_random_uuid(),
  nome text unique not null check (nome in ('Administrador','Planejador','Supervisor','Executor','Visualizador')),
  ativo boolean not null default true
);

create table if not exists public.usuarios_perfis (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique,
  perfil_id uuid not null references public.perfis_acesso(id),
  equipe_id uuid references public.equipes(id),
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists idx_programacoes_data on public.programacoes(data_programada);
create index if not exists idx_programacoes_status on public.programacoes(status);
create index if not exists idx_programacoes_equipe on public.programacoes(equipe_id);
create index if not exists idx_programacoes_disciplina on public.programacoes(disciplina_id);
create index if not exists idx_execucoes_programacao on public.execucoes(programacao_id);
create index if not exists idx_auditoria_created on public.auditoria(created_at desc);

insert into public.tipos_atividade (nome) values ('Ponto a Ponto'),('Loop Teste'),('Preservação') on conflict (nome) do nothing;
insert into public.perfis_acesso (nome) values ('Administrador'),('Planejador'),('Supervisor'),('Executor'),('Visualizador') on conflict (nome) do nothing;

alter table public.disciplinas enable row level security;
alter table public.equipes enable row level security;
alter table public.funcionarios enable row level security;
alter table public.atividades enable row level security;
alter table public.programacoes enable row level security;
alter table public.execucoes enable row level security;
alter table public.execucao_fotos enable row level security;
alter table public.ocorrencias enable row level security;
alter table public.reprogramacoes enable row level security;
alter table public.importacoes enable row level security;
alter table public.importacao_itens enable row level security;
alter table public.historico_status enable row level security;
alter table public.auditoria enable row level security;
alter table public.perfis_acesso enable row level security;
alter table public.usuarios_perfis enable row level security;

-- V01: políticas de leitura para usuários autenticados.
-- As políticas de escrita devem ser refinadas conforme o perfil/escopo antes de produção.
create policy "auth read disciplinas" on public.disciplinas for select to authenticated using (true);
create policy "auth read equipes" on public.equipes for select to authenticated using (true);
create policy "auth read funcionarios" on public.funcionarios for select to authenticated using (true);
create policy "auth read atividades" on public.atividades for select to authenticated using (true);
create policy "auth read programacoes" on public.programacoes for select to authenticated using (true);
create policy "auth read execucoes" on public.execucoes for select to authenticated using (true);
create policy "auth read fotos" on public.execucao_fotos for select to authenticated using (true);
create policy "auth read ocorrencias" on public.ocorrencias for select to authenticated using (true);
create policy "auth read reprogramacoes" on public.reprogramacoes for select to authenticated using (true);
create policy "auth read importacoes" on public.importacoes for select to authenticated using (true);
create policy "auth read importacao_itens" on public.importacao_itens for select to authenticated using (true);
create policy "auth read historico_status" on public.historico_status for select to authenticated using (true);
create policy "auth read auditoria" on public.auditoria for select to authenticated using (true);
create policy "auth read perfis" on public.perfis_acesso for select to authenticated using (true);
create policy "auth read usuarios_perfis" on public.usuarios_perfis for select to authenticated using (true);
