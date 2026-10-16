-- Planning Pro — 008: acesso seguro da equipe de campo
--
-- A equipe de campo entra por código de acesso (sem sessão do Supabase Auth), ou seja, com a role anon.
-- Até aqui o frontend lia e gravava tb_programacoes/tb_execucoes diretamente como anon, o que exige
-- policies abertas: qualquer pessoa com a chave pública conseguiria ler, alterar ou apagar a programação.
--
-- Estas funções validam o código a cada chamada, restringem os dados à equipe da pessoa e aplicam no
-- servidor a regra "equipe de campo só altera colunas marcadas como editáveis".
-- O app (app.js) usa estas funções automaticamente quando existem; sem elas, usa o acesso direto antigo.
--
-- Execute no SQL Editor do Supabase. Depois de validar o login de campo, rode a PARTE 2 (opcional).

begin;

-- ---------------------------------------------------------------------------
-- PARTE 1 — funções
-- ---------------------------------------------------------------------------

-- Programação da semana para a equipe do técnico, com equipamento e execuções embutidos.
create or replace function public.tecnico_programacao(p_cracha text, p_semana integer)
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
    'equipamento', (select to_jsonb(e) from public.tb_equipamentos e where e.id = p.equipamento_id),
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
  where p.semana::text = p_semana::text
    and (tec.equipe_id is null or p.equipe_id = tec.equipe_id)
  order by p.created_at, p.id;
$$;

-- Registra execução em um ou mais itens da equipe do técnico.
create or replace function public.tecnico_registrar_execucao(
  p_cracha text,
  p_programacao_ids uuid[],
  p_observacao text default null
)
returns setof jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_tec record;
begin
  select id, equipe_id into v_tec
  from public.tb_pessoas
  where cracha = trim(p_cracha) and ativo = true and perfil <> 'ADMINISTRADOR'
  limit 1;

  if v_tec.id is null then
    raise exception 'Código de acesso inválido ou inativo.' using errcode = '42501';
  end if;

  if coalesce(array_length(p_programacao_ids, 1), 0) = 0 then
    return;
  end if;

  if exists (
    select 1
    from unnest(p_programacao_ids) as i(id)
    left join public.tb_programacoes p on p.id = i.id
    where p.id is null
       or (v_tec.equipe_id is not null and p.equipe_id is distinct from v_tec.equipe_id)
  ) then
    raise exception 'Há itens que não pertencem à equipe deste técnico.' using errcode = '42501';
  end if;

  update public.tb_programacoes
  set status = 'EXECUTADO', updated_at = now()
  where id = any(p_programacao_ids);

  return query
  with ins as (
    insert into public.tb_execucoes (programacao_id, executante_id, executado_em, observacao)
    select i.id, v_tec.id, now(), nullif(trim(p_observacao), '')
    from unnest(p_programacao_ids) as i(id)
    returning id, programacao_id, executante_id, executado_em, observacao
  )
  select jsonb_build_object(
    'id', ins.id,
    'programacao_id', ins.programacao_id,
    'executante_id', ins.executante_id,
    'executado_em', ins.executado_em,
    'observacao', ins.observacao
  )
  from ins;
end;
$$;

-- Salva campos personalizados; só aceita chaves de colunas com editavel_tecnico = true.
create or replace function public.tecnico_salvar_campos(
  p_cracha text,
  p_programacao_id uuid,
  p_dados jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_tec record;
  v_prog record;
  v_permitidos jsonb;
  v_resultado jsonb;
begin
  select id, equipe_id into v_tec
  from public.tb_pessoas
  where cracha = trim(p_cracha) and ativo = true and perfil <> 'ADMINISTRADOR'
  limit 1;

  if v_tec.id is null then
    raise exception 'Código de acesso inválido ou inativo.' using errcode = '42501';
  end if;

  select id, atividade_id, equipe_id, dados_personalizados into v_prog
  from public.tb_programacoes
  where id = p_programacao_id;

  if v_prog.id is null or (v_tec.equipe_id is not null and v_prog.equipe_id is distinct from v_tec.equipe_id) then
    raise exception 'Programação não encontrada para a equipe deste técnico.' using errcode = '42501';
  end if;

  select coalesce(jsonb_object_agg(d.key, d.value), '{}'::jsonb) into v_permitidos
  from jsonb_each(coalesce(p_dados, '{}'::jsonb)) as d(key, value)
  where d.key in (
    select c.chave from public.tb_atividade_colunas c
    where c.atividade_id = v_prog.atividade_id and c.editavel_tecnico = true
  );

  v_resultado := coalesce(v_prog.dados_personalizados, '{}'::jsonb) || v_permitidos;

  update public.tb_programacoes
  set dados_personalizados = v_resultado, updated_at = now()
  where id = p_programacao_id;

  return v_resultado;
end;
$$;

revoke all on function public.tecnico_programacao(text, integer) from public;
revoke all on function public.tecnico_registrar_execucao(text, uuid[], text) from public;
revoke all on function public.tecnico_salvar_campos(text, uuid, jsonb) from public;
grant execute on function public.tecnico_programacao(text, integer) to anon, authenticated;
grant execute on function public.tecnico_registrar_execucao(text, uuid[], text) to anon, authenticated;
grant execute on function public.tecnico_salvar_campos(text, uuid, jsonb) to anon, authenticated;

commit;

-- ---------------------------------------------------------------------------
-- PARTE 2 (opcional, recomendada) — fechar o acesso anônimo direto às tabelas
-- Rode somente depois de confirmar que o login de campo funciona com as funções acima.
-- Mantém a leitura anônima de atividades/colunas/equipes, que a tela de campo usa.
-- ---------------------------------------------------------------------------
-- begin;
-- drop policy if exists "anon read programacoes"   on public.tb_programacoes;
-- drop policy if exists "anon insert programacoes" on public.tb_programacoes;
-- drop policy if exists "anon update programacoes" on public.tb_programacoes;
-- drop policy if exists "anon delete programacoes" on public.tb_programacoes;
-- drop policy if exists "anon write atividades"        on public.tb_atividades;
-- drop policy if exists "anon write atividade colunas" on public.tb_atividade_colunas;
-- -- Revise também as policies de tb_execucoes e tb_equipamentos para a role anon:
-- -- select policyname, cmd, roles from pg_policies where tablename in ('tb_execucoes','tb_equipamentos');
-- commit;
