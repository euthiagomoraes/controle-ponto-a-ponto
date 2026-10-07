# Controle Ponto a Ponto — Rev. 7

Esta revisão evolui a Rev. 3 para uma arquitetura administrativa modular, mantendo o fluxo de campo de Ponto a Ponto.

## 1. Dashboard — Previsto x Realizado

A área administrativa mantém o painel de acompanhamento com filtros de **Semana**, **Atividade** e **Equipe**, além de exportação de relatório em PDF personalizado com gráfico, filtros, data/hora e responsável logado. O painel mantém:
- previsto, realizado, saldo e percentual;
- evolução semanal;
- progresso da semana;
- comparação por atividade;
- últimas execuções.

## 2. Programação

A programação agora trabalha com o ID do módulo/atividade e pode receber campos personalizados definidos na configuração do próprio módulo.

Campos de planejamento fixos:
- Semana;
- Data prevista;
- Atividade;
- Equipe;
- Responsável;
- Quantidade prevista;
- Observação.

Depois dos campos fixos, o formulário adiciona dinamicamente as colunas personalizadas do módulo selecionado.

## 3. Atividades e módulos

Nova área administrativa: **Atividades e módulos**.

Cada atividade é tratada como um módulo independente. Os exemplos iniciais são:
- Ponto a Ponto;
- Loop Teste;
- Preservação.

Para cada módulo o administrador pode:
- criar uma nova atividade;
- editar nome e descrição;
- excluir a atividade;
- criar colunas personalizadas;
- editar colunas;
- excluir colunas;
- reordenar colunas por arrastar e soltar;
- definir tipo do campo: Texto, Número, Data, Lista ou Sim/Não;
- definir campo obrigatório;
- definir opções para campos do tipo Lista.

## 4. Máscara de Excel por módulo

Cada atividade possui sua própria máscara.

O botão **Exportar máscara** gera um arquivo `.xlsx` com:
- planilha **Importação** contendo os cabeçalhos na ordem configurada;
- segunda planilha **Leia-me** com instruções e tipos de campo.

O botão **Importar Excel** lê a primeira planilha do arquivo, valida as colunas obrigatórias e grava os registros no módulo.

Para o módulo **Ponto a Ponto**, os campos compatíveis também são normalizados para o fluxo técnico existente.

A exportação/importação usa o SheetJS Community Edition 0.20.3 no navegador, conforme a instalação standalone publicada pela documentação oficial. Para estabilidade em produção, a própria documentação recomenda versionar/venderizar a biblioteca em vez de depender de CDN. citeturn426366search3turn426366search14

## 5. Visualização modular das colunas

Na configuração de cada atividade, o administrador pode visualizar e editar a estrutura em dois modos:
- **Empilhadas** — uma coluna por linha, melhor para edição e telas menores;
- **Lado a lado** — cartões em grade, melhor para conferência horizontal.

A revisão elimina a duplicação visual que ocorria entre a prévia e a lista editável: a própria lista de colunas muda de layout conforme o modo escolhido. A preferência fica gravada no navegador em `ppaColumnViewMode`. A ordem mostrada é exatamente a ordem usada na máscara do Excel.

## 6. Fluxo de importação Excel

Ao selecionar um arquivo no módulo, o sistema primeiro valida a primeira planilha contra as colunas configuradas. Depois abre uma escolha obrigatória:
- **Nova importação**: substitui os registros já carregados daquele módulo;
- **Inclusão**: mantém a base atual e acrescenta os registros do novo arquivo.

A opção escolhida fica registrada no processamento e os registros recebem identificação da importação/linha do Excel. Na integração definitiva, este ponto deve chamar a rotina de gravação transacional do Supabase para que `tb_modulo_registros`/`tb_ponto_a_ponto` receba a operação de substituição ou inclusão sem duplicar dados de forma acidental.

## 5. Pessoas e códigos de acesso

Nova área administrativa: **Pessoas & Acessos**.

Permite cadastrar:
- nome;
- função;
- e-mail;
- código de acesso;
- perfil;
- equipe;
- status.

Também permite:
- gerar código automaticamente;
- editar cadastro;
- excluir cadastro;
- bloquear/desbloquear acesso.

O Login do Técnico consulta os cadastros ativos por código. Nesta revisão, o armazenamento ainda é local para permitir validação visual e funcional.


## 6. Execução múltipla no Técnico de Campo

A tela do Técnico de Campo agora possui uma caixa de seleção em cada TAG, opção **Selecionar todos** para os resultados filtrados e o botão **Registrar selecionados**. Os registros são gravados individualmente em sequência, mantendo data/hora, usuário logado e equipe no histórico.

O fluxo individual de seleção/registro continua disponível para operações unitárias.

## 8. Persistência atual

Nesta entrega, as novas configurações são armazenadas em `localStorage`:

- `ppaModules` — módulos/atividades e suas colunas;
- `ppaAccesses` — pessoas e códigos;
- `ppaModuleRecords` — registros importados por módulo;
- `ppaProgramacoes` — programação;
- `ppaImportedRows` — base importada do Ponto a Ponto.

Isso permite testar toda a interface antes de conectar definitivamente o Supabase.

## 9. Próxima integração de backend

A arquitetura final deve substituir o `localStorage` pelas tabelas existentes do ecossistema Supabase, mantendo RLS e isolamento por família/projeto.

A proposta funcional é:

- `tb_pessoas` → pessoas;
- `tb_acessos` → códigos de acesso e status;
- `tb_permissoes` → permissões por usuário/equipe/módulo;
- `tb_atividades` → módulos;
- tabela de configuração de colunas → definição da máscara de cada atividade;
- `tb_programacoes` → planejamento + dados personalizados;
- `tb_execucoes_campo` → execução real.

A integração SQL deve ser feita após conferir os nomes/tipos das colunas atuais, sem substituir a estrutura existente às cegas.

## 10. Git

```powershell
cd "C:\Users\thiago.moraes\Downloads\controle-ponto-a-ponto"
git status
git add index.html app.js styles.css README.md
 git commit -m "Cria arquitetura modular, acessos e mascaras Excel"
git push origin main
```

## Observação de segurança

A separação Administrador x Técnico no frontend é apenas de interface. Em produção, a autorização real deve ser garantida por Supabase Auth, RLS e permissões no backend.


## Rev. 8 — Ajustes de navegação e importação da Programação

### 11. Barra lateral desktop
- Ícones da navegação substituídos por SVGs vetoriais.
- Botão no cabeçalho da barra lateral permite expandir/recolher o menu.
- O estado expandido/recolhido fica salvo em `localStorage` (`ppaSidebarCollapsed`).
- Ao recolher, os textos somem e os ícones permanecem centralizados; o conteúdo principal ocupa o espaço liberado.

### 12. Importação Excel na Programação
A tela **Programação de atividades** agora possui:
- **Baixar template Excel**;
- **Importar Excel**;
- importação vinculada à atividade selecionada no filtro **ATIVIDADE**;
- template composto pelos campos fixos da programação e pelas colunas personalizadas configuradas na atividade em **Atividades**;
- validação dos cabeçalhos e dos campos obrigatórios;
- importação **cumulativa**, acrescentando novas linhas sem apagar as programações existentes.

O template gera as planilhas `Programação` e `Leia-me`. A atividade selecionada é identificada no template e usada como referência durante a importação.
