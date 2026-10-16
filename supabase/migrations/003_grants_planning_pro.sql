-- Planning Pro — permissões de tabela para a role authenticated
-- Execute no SQL Editor do Supabase.
-- O RLS continua sendo o responsável por controlar quais linhas cada perfil pode acessar.

begin;

grant usage on schema public to authenticated;

grant select, insert, update, delete on public.tb_atividade_colunas to authenticated;
grant select, insert, update, delete on public.tb_atividades to authenticated;
grant select, insert, update, delete on public.tb_equipamentos to authenticated;
grant select, insert, update, delete on public.tb_equipes to authenticated;
grant select, insert, update, delete on public.tb_execucoes to authenticated;
grant select, insert, update, delete on public.tb_pessoas to authenticated;
grant select, insert, update, delete on public.tb_programacoes to authenticated;

grant execute on function public.eh_admin() to authenticated;
grant execute on function public.meu_pessoa_id() to authenticated;

commit;
