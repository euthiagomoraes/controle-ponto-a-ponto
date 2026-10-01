# Book de Requisições — Versão 01

Implementação inicial do layout aprovado em React + TypeScript + Vite, com responsividade para desktop e celular.

## O que já está implementado

- Dashboard com KPIs, gráficos, atividades, ações rápidas e atualizações.
- Programação com filtros, tabela e modal de importação cumulativa.
- Execução com consulta de atividades, início/conclusão e formulário de campo.
- Cadastros de atividades, disciplinas, equipes e funcionários.
- Usuários e permissões.
- Relatórios.
- Auditoria e detalhe de alterações.
- Configurações.
- Navegação lateral responsiva.
- Camada Supabase preparada com `.env`.
- Migração SQL inicial com entidades, índices e RLS de leitura.
- Imagem de referência em `public/layout-v01.png`.

## Rodar

```bash
npm install
npm run dev
```

Depois acesse `http://localhost:5173`.

## Supabase

Copie `.env.example` para `.env` e informe:

```env
VITE_SUPABASE_URL=https://SEU-PROJETO.supabase.co
VITE_SUPABASE_ANON_KEY=SUA_CHAVE_ANON
```

Aplique `supabase/migrations/001_init.sql` no SQL Editor do Supabase.

## Próxima etapa de integração

O layout está funcional com dados de demonstração. Para produção, conectar os serviços de cada tela ao Supabase, configurar as políticas RLS por perfil/escopo, implementar o parser de Excel com persistência em `importacoes`/`importacao_itens`, Storage para fotos e autenticação por Supabase Auth.
