-- Planning Pro: padroniza a validação de disciplinas de equipes.
-- Aceita códigos com ou sem acentos e mantém a aplicação gravando códigos sem acentos.
-- Execute no Supabase SQL Editor antes de publicar a versão v09.

alter table public.tb_equipes
  drop constraint if exists tb_equipes_disciplina_check;

alter table public.tb_equipes
  add constraint tb_equipes_disciplina_check
  check (
    translate(
      upper(trim(disciplina)),
      'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
      'AAAAAEEEEIIIIOOOOOUUUUC'
    ) in (
      'ELETRICA',
      'INSTRUMENTACAO',
      'TUBULACAO',
      'MECANICA',
      'AUTOMACAO',
      'CIVIL'
    )
  );

-- Confirma os valores existentes após a alteração.
select id, nome, disciplina, ativo
from public.tb_equipes
order by nome;
