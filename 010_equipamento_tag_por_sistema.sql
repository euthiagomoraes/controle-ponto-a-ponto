-- Planning Pro — 010: o mesmo TAG pode existir em sistemas diferentes
--
-- O equipamento passa a ser identificado por TAG + SYS + SUBSYS.
-- Esta migration:
--   1. remove restrições/índices únicos que exigem TAG única sozinho em tb_equipamentos;
--   2. cria a unicidade por (TAG, SYS, SUBSYS), tratando SYS/SUBSYS vazios como iguais.
--
-- Não apaga dados. Pode ser executada mais de uma vez.
-- Se o passo 2 falhar com "could not create unique index", já existem equipamentos repetidos
-- com o mesmo TAG/SYS/SUBSYS; rode a consulta de conferência no fim do arquivo para encontrá-los.

begin;

-- 1a. Restrições UNIQUE cuja única coluna é "tag".
do $$
declare r record;
begin
  for r in
    select c.conname
    from pg_constraint c
    where c.conrelid = 'public.tb_equipamentos'::regclass
      and c.contype = 'u'
      and (
        select array_agg(a.attname::text order by a.attname)
        from unnest(c.conkey) as k(attnum)
        join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum
      ) = array['tag']
  loop
    execute format('alter table public.tb_equipamentos drop constraint %I', r.conname);
    raise notice 'Removida a restrição %', r.conname;
  end loop;
end $$;

-- 1b. Índices únicos avulsos (sem constraint) somente em "tag".
do $$
declare r record;
begin
  for r in
    select i.indexrelid::regclass::text as idx
    from pg_index i
    where i.indrelid = 'public.tb_equipamentos'::regclass
      and i.indisunique and not i.indisprimary
      and i.indexprs is null
      and (
        select array_agg(a.attname::text order by a.attname)
        from unnest(i.indkey) as k(attnum)
        join pg_attribute a on a.attrelid = i.indrelid and a.attnum = k.attnum
      ) = array['tag']
      and not exists (select 1 from pg_constraint c where c.conindid = i.indexrelid)
  loop
    execute format('drop index %s', r.idx);
    raise notice 'Removido o índice %', r.idx;
  end loop;
end $$;

-- 2. Unicidade pelo equipamento completo.
create unique index if not exists uq_tb_equipamentos_tag_sys_subsys
  on public.tb_equipamentos (tag, coalesce(sys, ''), coalesce(subsys, ''));

commit;

-- Conferência: índices/restrições únicos que ficaram em tb_equipamentos.
select indexrelid::regclass as indice, pg_get_indexdef(indexrelid) as definicao
from pg_index
where indrelid = 'public.tb_equipamentos'::regclass and indisunique;

-- Se o passo 2 falhou, estes são os equipamentos repetidos:
-- select tag, coalesce(sys,'') sys, coalesce(subsys,'') subsys, count(*)
-- from public.tb_equipamentos group by 1,2,3 having count(*) > 1;
