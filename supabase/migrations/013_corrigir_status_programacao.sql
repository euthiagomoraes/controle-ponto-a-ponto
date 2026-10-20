-- Planning Pro — 013: corrige "violates check constraint tb_programacoes_status_check"
--
-- O banco tem uma regra que limita os valores da coluna status de tb_programacoes.
-- O app grava PROGRAMADO (importação, lançamento, reprogramação) e EXECUTADO (registro de campo).
-- Esta migration:
--   1. mostra a regra atual (conferência);
--   2. recria a regra aceitando os valores do app + todos os valores que já existem na tabela
--      (nenhum registro atual fica inválido);
--   3. atualiza tecnico_registrar_execucao: se mesmo assim o status for recusado, a execução é gravada.
-- A situação "executado" exibida no app vem de tb_execucoes; o status é apenas informativo.
--
-- Não apaga dados. Pode ser executada mais de uma vez.

-- 1. Conferência (antes): definição atual da regra e valores em uso.
select conname, pg_get_constraintdef(oid) as definicao
from pg_constraint
where conrelid = 'public.tb_programacoes'::regclass and contype = 'c' and conname ilike '%status%';
select status, count(*) from public.tb_programacoes group by status order by 2 desc;

begin;

-- 2. Regra de status compatível com o app.
do $$
declare
  r record;
  v_valores text;
begin
  for r in
    select conname from pg_constraint
    where conrelid = 'public.tb_programacoes'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%status%'
  loop
    execute format('alter table public.tb_programacoes drop constraint %I', r.conname);
    raise notice 'Removida a regra %', r.conname;
  end loop;

  select string_agg(quote_literal(v), ', ' order by v) into v_valores
  from (
    select unnest(array['PROGRAMADO', 'EXECUTADO', 'PENDENTE', 'EM_ANDAMENTO', 'CANCELADO']) as v
    union
    select distinct status from public.tb_programacoes where status is not null
  ) valores;

  execute format('alter table public.tb_programacoes add constraint tb_programacoes_status_check check (status is null or status in (%s))', v_valores);
  raise notice 'Nova regra: status in (%)', v_valores;
end $$;

-- 3. Registro de execução tolerante ao status.
create or replace function public.tecnico_registrar_execucao(
  p_cracha text,
  p_programacao_ids uuid[],
  p_observacao text default null,
  p_executado_em timestamptz default null
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

  -- O status é informativo: a situação do item vem de tb_execucoes. Se o banco tiver uma regra
  -- (tb_programacoes_status_check) que não aceite 'EXECUTADO', a execução é gravada mesmo assim.
  begin
    update public.tb_programacoes
    set status = 'EXECUTADO', updated_at = now()
    where id = any(p_programacao_ids);
  exception when check_violation then
    raise notice 'status EXECUTADO recusado por tb_programacoes_status_check; execução registrada sem alterar o status';
  end;

  return query
  with ins as (
    insert into public.tb_execucoes (programacao_id, executante_id, executado_em, observacao)
    select i.id, v_tec.id, least(coalesce(p_executado_em, now()), now()), nullif(trim(p_observacao), '')
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

revoke all on function public.tecnico_registrar_execucao(text, uuid[], text, timestamptz) from public;
grant execute on function public.tecnico_registrar_execucao(text, uuid[], text, timestamptz) to anon, authenticated;

commit;

notify pgrst, 'reload schema';

-- Conferência (depois)
select conname, pg_get_constraintdef(oid) as definicao
from pg_constraint
where conrelid = 'public.tb_programacoes'::regclass and conname = 'tb_programacoes_status_check';
