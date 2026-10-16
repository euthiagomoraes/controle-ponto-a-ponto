-- Planning Pro — 011: permitir o mesmo equipamento mais de uma vez na mesma semana
--
-- Regra do app: uma linha da programação só é duplicada quando TODOS os campos são iguais
-- (semana, equipe e todas as colunas da atividade). Ex.: o mesmo TAG/SYS/SUBSYS com SERVICE
-- diferente são dois itens. O app já bloqueia linhas idênticas na importação.
--
-- Esta migration remove de tb_programacoes as restrições/índices únicos que envolvem
-- equipamento_id (ex.: UNIQUE (equipamento_id, semana)), que recusariam esses itens.
-- Não apaga dados. Pode ser executada mais de uma vez.

begin;

-- Restrições UNIQUE que incluem equipamento_id.
do $$
declare r record;
begin
  for r in
    select c.conname
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attname = 'equipamento_id'
    where c.conrelid = 'public.tb_programacoes'::regclass
      and c.contype = 'u'
      and a.attnum = any (c.conkey)
  loop
    execute format('alter table public.tb_programacoes drop constraint %I', r.conname);
    raise notice 'Removida a restrição %', r.conname;
  end loop;
end $$;

-- Índices únicos avulsos (sem constraint) que incluem equipamento_id.
do $$
declare r record;
begin
  for r in
    select i.indexrelid::regclass::text as idx
    from pg_index i
    join pg_attribute a on a.attrelid = i.indrelid and a.attname = 'equipamento_id'
    where i.indrelid = 'public.tb_programacoes'::regclass
      and i.indisunique and not i.indisprimary
      and a.attnum = any (i.indkey::int2[])
      and not exists (select 1 from pg_constraint c where c.conindid = i.indexrelid)
  loop
    execute format('drop index %s', r.idx);
    raise notice 'Removido o índice %', r.idx;
  end loop;
end $$;

-- Mantém a consulta por equipamento/semana rápida (não único).
create index if not exists idx_tb_programacoes_equip_semana on public.tb_programacoes (equipamento_id, semana);

commit;

-- Conferência: índices únicos que restaram em tb_programacoes (deve sobrar apenas a chave primária).
select indexrelid::regclass as indice, pg_get_indexdef(indexrelid) as definicao
from pg_index
where indrelid = 'public.tb_programacoes'::regclass and indisunique;
