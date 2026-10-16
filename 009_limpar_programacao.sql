-- Planning Pro — 009: limpeza para nova carga de programação
--
-- ATENÇÃO: APAGA DADOS DEFINITIVAMENTE. Não há como desfazer depois do COMMIT.
-- Remove todas as linhas de:
--   tb_execucoes     (registros de campo — dependem das programações)
--   tb_programacoes  (toda a programação importada/manual)
--   tb_equipamentos  (TAGs; são recriadas automaticamente na próxima importação)
--   tb_semanas       (o app não usa mais semanas cadastradas: a semana vem do Excel)
--
-- NÃO altera: atividades e colunas, equipes, pessoas/códigos de acesso.
--
-- Como usar no SQL Editor do Supabase:
--   1. Rode só o bloco "CONFERÊNCIA" e confira as quantidades.
--   2. Rode o bloco "LIMPEZA" inteiro.
--   3. Importe o novo Excel pelo app (Programação → Importar Excel).

-- ---------------------------------------------------------------------------
-- CONFERÊNCIA (somente leitura)
-- ---------------------------------------------------------------------------
select 'tb_execucoes'    as tabela, count(*) as linhas from public.tb_execucoes
union all select 'tb_programacoes', count(*) from public.tb_programacoes
union all select 'tb_equipamentos', count(*) from public.tb_equipamentos
union all select 'tb_semanas',      count(*) from public.tb_semanas;

-- ---------------------------------------------------------------------------
-- LIMPEZA
-- ---------------------------------------------------------------------------
begin;

delete from public.tb_execucoes;
delete from public.tb_programacoes;
delete from public.tb_equipamentos;
delete from public.tb_semanas;

-- Confere: todas devem mostrar 0.
select 'tb_execucoes'    as tabela, count(*) as linhas from public.tb_execucoes
union all select 'tb_programacoes', count(*) from public.tb_programacoes
union all select 'tb_equipamentos', count(*) from public.tb_equipamentos
union all select 'tb_semanas',      count(*) from public.tb_semanas;

commit;

-- Opcional: remover a tabela de semanas, que o app não usa mais.
-- drop table if exists public.tb_semanas;
