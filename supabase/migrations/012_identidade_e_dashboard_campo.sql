-- Planning Pro — 012: identidade visual compartilhada + dashboard da equipe de campo
--
-- 1. tb_configuracoes: guarda a identidade visual (logo e cores) definida pelo Administrador.
--    Leitura liberada também para a role anon, porque a tela de login usa a logo antes de qualquer acesso.
--    Somente administradores (public.eh_admin()) podem gravar.
-- 2. tecnico_programacao_periodo: programação de várias semanas da equipe do técnico, para o Dashboard
--    de campo (indicadores, tendência, backlog e apontamentos). Mesmas regras de segurança da 008.
--
-- Não apaga dados. Pode ser executada mais de uma vez.

begin;

-- ---------------------------------------------------------------------------
-- 1. Identidade visual
-- ---------------------------------------------------------------------------
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

drop policy if exists tb_configuracoes_admin on public.tb_configuracoes;
create policy tb_configuracoes_admin on public.tb_configuracoes
  for all to authenticated using (public.eh_admin()) with check (public.eh_admin());

-- ---------------------------------------------------------------------------
-- 2. Dashboard de campo: programação de um intervalo de semanas (máx. 26)
-- ---------------------------------------------------------------------------
create or replace function public.tecnico_programacao_periodo(p_cracha text, p_semana_de integer, p_semana_ate integer)
returns setof jsonb
language sql
stable
security definer
set search_path = public
as $$
  with tec as (
    select id, equipe_id
    from public.tb_pessoas
    where cracha = trim(p_cracha) and ativo = true and perfil <> 'ADMINISTRADOR'
    limit 1
  )
  select to_jsonb(p) || jsonb_build_object(
    'equipe_nome', (select eq.nome from public.tb_equipes eq where eq.id = p.equipe_id),
    'execucoes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', x.id,
        'programacao_id', x.programacao_id,
        'executante_id', x.executante_id,
        'executante_nome', pe.nome,
        'executado_em', x.executado_em,
        'observacao', x.observacao
      ) order by x.executado_em)
      from public.tb_execucoes x
      left join public.tb_pessoas pe on pe.id = x.executante_id
      where x.programacao_id = p.id
    ), '[]'::jsonb)
  )
  from public.tb_programacoes p
  cross join tec
  where p.semana::integer between p_semana_de and least(p_semana_ate, p_semana_de + 25)
    and (tec.equipe_id is null or p.equipe_id = tec.equipe_id)
  order by p.semana, p.created_at, p.id;
$$;

revoke all on function public.tecnico_programacao_periodo(text, integer, integer) from public;
grant execute on function public.tecnico_programacao_periodo(text, integer, integer) to anon, authenticated;

commit;

notify pgrst, 'reload schema';
