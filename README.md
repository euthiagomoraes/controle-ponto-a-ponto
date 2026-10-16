# Planning Pro

Programação de atividades para equipes de execução em campo.

O planejamento importa a programação da semana por Excel; a equipe de campo vê os itens da sua equipe, registra a execução e, quando permitido, atualiza campos. Cada **atividade** (Ponto a Ponto, Loop Teste, Preservação…) tem **colunas próprias**, e essas colunas definem o template Excel, a tabela de programação e a tela de campo.

## Fluxo

1. **Atividades** — crie a atividade e suas colunas (tipo, editável em campo, opções de lista). Arraste para ordenar. Nenhuma coluna é obrigatória.
2. **Equipes e acessos** — cadastre equipes e pessoas (com código de acesso de 6 dígitos). Semanas não são cadastradas: vêm da coluna SEMANA do Excel.
3. **Programação** — escolha a atividade, baixe o **Template Excel**, preencha e use **Importar Excel**.
   - O arquivo é validado inteiro antes de gravar: todos os erros aparecem por linha e nada é gravado enquanto houver erro.
   - **Incluir na programação**: acrescenta as linhas (com opção de ignorar linhas que já existem: mesma semana, equipe e TAG).
   - **Nova programação**: substitui os itens **pendentes** daquela atividade nas semanas do arquivo; itens executados são preservados.
4. **Campo** — a pessoa entra com o código, vê a semana atual da sua equipe, registra a execução com a **data em que foi feita** (individual ou em lote, com observação) e preenche as colunas liberadas (ex.: colunas do tipo Data marcadas como "Equipe de campo pode alterar"). O login de campo continua ativo ao atualizar a página, até clicar em Sair.
   O planejamento vê a situação e a data de execução de cada item na tela **Programação**.
5. **Editar e reprogramar** — na Programação, cada item tem **Editar** (semana, equipe e colunas da atividade) e **Reprogramar**; marcando várias linhas aparece a barra de ações em lote (reprogramar ou excluir). Só itens pendentes podem ser reprogramados. O app avisa e mantém na semana original os itens cuja TAG já está programada na semana de destino. O histórico de semanas fica no próprio item (`dados_personalizados._semanas_anteriores`) e aparece como "↻ W136" na tabela e "Reprogramado de W136" no campo.
6. **Backlog** — itens não executados de semanas anteriores à atual. A tela Backlog lista, filtra e reprograma em lote (sugere a próxima semana). O menu mostra a quantidade.
7. **Dashboard / Relatórios / Importações** — previsto x realizado, **backlog** (KPI e quantidade por semana de origem) e **últimos apontamentos** (execuções registradas pelo campo); exportação PDF/JPEG; histórico das cargas calculado a partir do banco. Detalhe: previsto x realizado por semana, equipe e atividade; exportação PDF/JPEG; histórico das cargas calculado a partir do banco.

### Template Excel

O template tem as colunas padrão `SEMANA` e `EQUIPE` e, em seguida, exatamente as colunas criadas na atividade, na mesma ordem. A atividade é a escolhida na tela de Programação; colunas extras no arquivo são ignoradas. A aba **Leia-me** traz os tipos, as opções aceitas e as equipes cadastradas.

As colunas da atividade podem ficar em branco. SEMANA e EQUIPE precisam estar preenchidas em cada linha, porque definem quando e para qual equipe o item aparece.

- Semana: `W137` ou só `137` (também aceita `w137`, `W-137`, `Semana 137`); é sempre gravada como W137.
- Equipe: nome cadastrado (aceita `A` para `Equipe A` quando não houver ambiguidade).
- Datas: `DD/MM/AAAA` ou data nativa do Excel.
- Listas: o valor precisa estar entre as opções (maiúsculas/acentos são normalizados). Sim/Não aceita `SIM`, `S`, `X`, `NÃO`, `N`.

## Arquivos

| Arquivo | Conteúdo |
|---|---|
| `index.html` | Estrutura das telas e modais |
| `styles.css` | Design system (tokens, tema claro/escuro, layout responsivo) |
| `app.js` | Aplicação (Supabase, importação, campo, dashboards, exportações) |
| `supabase-config.js` | URL e chave publicável do projeto Supabase |
| `00x_*.sql` | Migrations para rodar no SQL Editor do Supabase |

Bibliotecas via CDN com versão fixa: supabase-js 2.45.4, xlsx-js-style 1.2.0, jsPDF 2.5.1.

## Banco de dados (Supabase)

Tabelas usadas: `tb_atividades`, `tb_atividade_colunas`, `tb_programacoes` (colunas da atividade em `dados_personalizados`), `tb_execucoes`, `tb_equipamentos`, `tb_equipes`, `tb_pessoas`. (`tb_semanas` não é mais usada.)

Migrations, em ordem:

- `001_programacao_supabase.sql` — **histórico**; a estrutura atual de `tb_programacoes` usa `semana`, `atividade_id`, `equipe_id`, `dados_personalizados` etc.
- `003` a `007` — grants, semanas, login por código, disciplinas e modo de importação.
- `008_tecnico_rpc_seguro.sql` — **obrigatória para a tela de campo**. Cria `tecnico_contexto`, `tecnico_programacao`, `tecnico_registrar_execucao` e `tecnico_salvar_campos`. Elas validam o código a cada chamada, limitam os dados à equipe da pessoa, só aceitam alteração em colunas marcadas como editáveis e não aceitam data de execução no futuro. Pode ser executada mais de uma vez.

### Segurança

- Administradores entram com Supabase Auth; o perfil vem de `tb_pessoas.perfil = 'ADMINISTRADOR'` vinculado por `auth_user_id`.
- A equipe de campo entra por código (role `anon`), que **não tem permissão nas tabelas**. Todo acesso de campo passa pelas funções da 008 (`SECURITY DEFINER`). Sem a 008, a tela de campo mostra um aviso pedindo para executá-la.
- Os códigos podem ser testados por força bruta via `login_tecnico_por_cracha`. Use 6 dígitos (padrão do gerador) e considere limitar tentativas.

## Preferências locais

Ficam no navegador apenas: cores/logo dos documentos (`ppaSettings`), tema (`ppaTheme`), menu recolhido (`ppaSidebarCollapsed`) e o código da sessão de campo (`ppaFieldCode`, apagado ao clicar em Sair). Chaves de versões antigas que guardavam dados de negócio são apagadas ao abrir o app.
