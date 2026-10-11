-- Planning Pro — correção da restrição chk_tb_programacoes_modo_importacao
-- Execute no SQL Editor do Supabase uma única vez.
-- O app grava os modos padronizados NOVA_PROGRAMACAO e INCLUIR_NA_PROGRAMACAO.
-- A validação abaixo exige que o campo não seja vazio, evitando incompatibilidade
-- entre versões do frontend e preservando os valores históricos já gravados.

begin;

alter table public.tb_programacoes
  drop constraint if exists chk_tb_programacoes_modo_importacao;

alter table public.tb_programacoes
  add constraint chk_tb_programacoes_modo_importacao
  check (modo_importacao is not null and length(btrim(modo_importacao)) > 0);

commit;
