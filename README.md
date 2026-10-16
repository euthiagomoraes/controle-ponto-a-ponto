# Planning Pro

Programação de atividades para equipes de execução em campo.

O planejamento importa a programação da semana por Excel; a equipe de campo vê os itens da sua equipe, registra a execução e, quando permitido, atualiza campos. Cada **atividade** (Ponto a Ponto, Loop Teste, Preservação…) tem **colunas próprias**, e essas colunas definem o template Excel, a tabela de programação e a tela de campo.

## Fluxo

1. **Atividades** — crie a atividade e suas colunas (tipo, editável em campo, opções de lista). Arraste para ordenar. Nenhuma coluna é obrigatória.
2. **Equipes e acessos** — cadastre equipes e pessoas (com código de acesso de 6 dígitos). Semanas não são cadastradas: vêm da coluna SEMANA do Excel.
3. **Programação** — escolha a atividade, baixe o **Template Excel**, preencha e use **Importar Excel**.
   - O arquivo é validado inteiro antes de gravar: todos os erros aparecem por linha e nada é gravado enquanto houver erro.
   - **Incluir na programação**: acrescenta as linhas.
   - **Nova programação**: substitui os itens **pendentes** daquela atividade nas semanas do arquivo; itens executados são preservados.
4. **Campo** — a pessoa entra com o código, vê a semana atual da sua equipe, registra a execução com a **data em que foi feita** (individual ou em lote, com observação) e preenche as colunas liberadas (ex.: colunas do tipo Data marcadas como "Equipe de campo pode alterar"). O login de campo continua ativo ao atualizar a página, até clicar em Sair. A equipe também tem o **Dashboard** com os indicadores da própria equipe (programadas, executadas, realização, tendência, backlog e apontamentos), via migration `012`.
   O planejamento vê a situação e a data de execução de cada item na tela **Programação**.
5. **Editar e reprogramar** — na Programação, cada item tem **Editar** (semana, equipe e colunas da atividade) e **Reprogramar**; marcando várias linhas aparece a barra de ações em lote (reprogramar ou excluir). Só itens pendentes podem ser reprogramados. O histórico de semanas fica no próprio item (`dados_personalizados._semanas_anteriores`) e aparece como "↻ W136" na tabela e "Reprogramado de W136" no campo.
6. **Backlog** — itens não executados de semanas anteriores à atual. A tela Backlog lista, filtra e reprograma em lote (sugere a próxima semana). O menu mostra a quantidade.
7. **Dashboard / Relatórios / Importações** — previsto x realizado com linhas de tendência, **backlog** (KPI e quantidade por semana de origem) e **últimos apontamentos** (execuções registradas pelo campo); exportação PDF/JPEG; histórico das cargas calculado a partir do banco.

### Template Excel

O template tem as colunas padrão `SEMANA` e `EQUIPE` e, em seguida, exatamente as colunas criadas na atividade, na mesma ordem. A atividade é a escolhida na tela de Programação; colunas extras no arquivo são ignoradas. A aba **Leia-me** traz os tipos, as opções aceitas e as equipes cadastradas.

As colunas da atividade podem ficar em branco. SEMANA e EQUIPE precisam estar preenchidas em cada linha, porque definem quando e para qual equipe o item aparece.

- Semana: `W137` ou só `137` (também aceita `w137`, `W-137`, `Semana 137`); é sempre gravada como W137.
- Linhas repetidas são permitidas: o app não bloqueia duplicados. O equipamento é identificado por TAG + SYS + SUBSYS (migration `010`), e o banco aceita o mesmo equipamento mais de uma vez na semana (migration `011`).
- Equipe: nome cadastrado (aceita `A` para `Equipe A` quando não houver ambiguidade).
- Datas: `DD/MM/AAAA` ou data nativa do Excel.
- Listas: o valor precisa estar entre as opções (maiúsculas/acentos são normalizados). Sim/Não aceita `SIM`, `S`, `X`, `NÃO`, `N`.

## Estrutura

```
index.html                 telas e modais (abrir este arquivo / publicar a raiz)
css/styles.css             design system: tokens, tema claro/escuro, responsivo
js/supabase-config.js      URL e chave publicável do Supabase
js/core/                   base compartilhada
  config.js                constantes, atividades padrão e estado
  utils.js                 texto, datas, semanas (W137), valores do Excel
  db.js                    cliente Supabase, paginação, mensagens de erro
  ui.js                    toast, modais, confirmação, selects
  auth.js                  login do planejamento e do campo, sessão
  dados.js                 carga de atividades, equipes, pessoas e programação
  navegacao.js             rotas (#programacao) e tela ativa
  graficos.js              agregações e gráficos (barras + tendência)
  perfil.js                tela de perfil
  exportacao.js            PDF e JPEG
js/admin/                  telas do planejamento
  dashboard.js · programacao.js · importacao-excel.js · historico-importacoes.js
  relatorios.js · atividades.js · equipes.js · configuracoes.js
js/campo/                  equipe de campo
  dados.js                 acesso via funções seguras (migration 008)
  telas.js                 atividades da semana, registro e histórico
js/app.js                  eventos da interface e inicialização (carregado por último)
supabase/migrations/       scripts para o SQL Editor do Supabase
```

Os scripts são carregados pelo `index.html` na ordem acima, sem etapa de build. Bibliotecas via CDN com versão fixa: supabase-js 2.45.4, xlsx-js-style 1.2.0, jsPDF 2.5.1.

## Banco de dados (Supabase)

Tabelas usadas: `tb_atividades`, `tb_atividade_colunas`, `tb_programacoes` (colunas da atividade em `dados_personalizados`), `tb_execucoes`, `tb_equipamentos`, `tb_equipes`, `tb_pessoas`, `tb_configuracoes`.

Migrations em `supabase/migrations/`, na ordem (todas podem ser executadas mais de uma vez):

| Arquivo | O que faz |
|---|---|
| `003_grants_planning_pro.sql` | Permissões da role `authenticated` nas tabelas |
| `005_tecnico_login_planning_pro.sql` | Login da equipe de campo por código (`login_tecnico_por_cracha`) |
| `006_corrigir_disciplina_equipes.sql` | Aceita as disciplinas com ou sem acento |
| `007_corrigir_modo_importacao.sql` | Aceita os modos de importação usados pelo app |
| `008_tecnico_rpc_seguro.sql` | **Obrigatória para o campo.** Funções `tecnico_contexto`, `tecnico_programacao`, `tecnico_registrar_execucao` e `tecnico_salvar_campos`: validam o código, limitam à equipe, só alteram colunas editáveis e não aceitam data futura |
| `010_equipamento_tag_por_sistema.sql` | Equipamento identificado por TAG + SYS + SUBSYS |
| `011_programacao_sem_unicidade_equipamento.sql` | Permite o mesmo equipamento mais de uma vez na semana (duplicados liberados) |
| `012_identidade_e_dashboard_campo.sql` | Tabela `tb_configuracoes` (logo e cores do sistema, legível na tela de login) e função `tecnico_programacao_periodo` para o Dashboard de campo |

### Segurança

- Administradores entram com Supabase Auth; o perfil vem de `tb_pessoas.perfil = 'ADMINISTRADOR'` vinculado por `auth_user_id`.
- A equipe de campo entra por código (role `anon`), que **não tem permissão nas tabelas**. Todo acesso de campo passa pelas funções da 008 (`SECURITY DEFINER`). Sem a 008, a tela de campo mostra um aviso pedindo para executá-la.
- Os códigos podem ser testados por força bruta via `login_tecnico_por_cracha`. Use 6 dígitos (padrão do gerador) e considere limitar tentativas.

## Preferências locais

A identidade visual (logo e cores) é definida pelo Administrador em Configurações e gravada em `tb_configuracoes`: vale para todos os usuários e para a tela de login. Ficam no navegador apenas: uma cópia dessa identidade para a primeira pintura da página (`ppaSettings`), tema (`ppaTheme`), menu recolhido (`ppaSidebarCollapsed`) e o código da sessão de campo (`ppaFieldCode`, apagado ao clicar em Sair). Chaves de versões antigas que guardavam dados de negócio são apagadas ao abrir o app.
