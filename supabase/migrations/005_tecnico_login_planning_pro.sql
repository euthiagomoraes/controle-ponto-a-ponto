-- Planning Pro — acesso seguro do Técnico por código
-- O login de Técnico usa código de acesso, sem criar uma sessão Supabase Auth.
-- Por isso, não deve consultar tb_pessoas diretamente com a role anon.

begin;

create or replace function public.login_tecnico_por_cracha(p_cracha text)
returns table (
  id uuid,
  nome text,
  cracha text,
  perfil text,
  ativo boolean,
  auth_user_id uuid,
  equipe_id uuid,
  disciplina text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id,
    p.nome,
    p.cracha,
    p.perfil,
    p.ativo,
    p.auth_user_id,
    p.equipe_id,
    p.disciplina
  from public.tb_pessoas p
  where p.cracha = trim(p_cracha)
    and p.ativo = true
    and p.perfil <> 'ADMINISTRADOR'
  limit 1;
$$;

grant execute on function public.login_tecnico_por_cracha(text) to anon, authenticated;

commit;
