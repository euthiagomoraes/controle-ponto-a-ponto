-- Planning Pro — 012: identidade visual compartilhada (logo e cores)
--
-- tb_configuracoes guarda a identidade visual definida pelo Administrador em Configurações.
-- A leitura é liberada também para a role anon, porque a tela de login (inclusive no celular)
-- mostra a logo antes de qualquer acesso. Só administradores ativos podem gravar.
--
-- O Dashboard da equipe de campo NÃO depende desta migration: ele usa a função da 008.
-- Não apaga dados. Pode ser executada mais de uma vez.

begin;

create table if not exists public.tb_configuracoes (
  chave text primary key,
  valor jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.tb_configuracoes enable row level security;

grant select on public.tb_configuracoes to anon, authenticated;
grant insert, update, delete on public.tb_configuracoes to authenticated;

drop policy if exists tb_configuracoes_leitura on public.tb_configuracoes;
create policy tb_configuracoes_leitura on public.tb_configuracoes
  for select to anon, authenticated using (true);

-- Administrador = pessoa ativa com perfil ADMINISTRADOR vinculada ao usuário do Supabase Auth.
drop policy if exists tb_configuracoes_admin on public.tb_configuracoes;
create policy tb_configuracoes_admin on public.tb_configuracoes
  for all to authenticated
  using (exists (
    select 1 from public.tb_pessoas p
    where p.auth_user_id = auth.uid() and p.ativo = true and p.perfil = 'ADMINISTRADOR'
  ))
  with check (exists (
    select 1 from public.tb_pessoas p
    where p.auth_user_id = auth.uid() and p.ativo = true and p.perfil = 'ADMINISTRADOR'
  ));

-- Versão anterior desta migration criava uma função que o app não usa mais.
drop function if exists public.tecnico_programacao_periodo(text, integer, integer);

commit;

notify pgrst, 'reload schema';

-- Conferência: deve retornar 1 linha depois que o Administrador abrir o sistema ou salvar Configurações.
select chave, updated_at, (valor ? 'logo') as tem_logo from public.tb_configuracoes;
