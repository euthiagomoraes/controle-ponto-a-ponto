# Controle de Ponto a Ponto — Revisão 2

Frontend responsivo do sistema **Controle de Ponto a Ponto**.

## Arquitetura

**GitHub → Vercel → Power Automate → Excel Online (OneDrive)**

O Excel continua sendo a fonte de dados. O navegador não deve receber credenciais, senhas ou segredos do Microsoft/Power Automate.

## Estrutura definitiva do Excel

Tabela principal: `tbPontoAPonto`

| Coluna | Campo | Regra |
|---|---|---|
| A | FORN. | somente leitura |
| B | SYS | somente leitura + filtro |
| C | SUBSYS | somente leitura + filtro |
| D | LOOP | somente leitura |
| E | TAG | chave única / pesquisa |
| F | SERVICE | somente leitura |
| G | TIPE | somente leitura |
| H | DESCRIÇÃO | somente leitura |
| I | Week | programação manual da semana |
| J | PONTO-A-PONTO | última data/hora registrada; atualização por TAG |
| K | Logs | campo auxiliar existente; não é alterado pelo registro de ponto a ponto |

Login: tabela `tbLogin` com `NOME`, `CRACHA`, `ATIVO`, `PERFIL`.

## Regras da Rev. 2

1. O sistema calcula a semana atual, mas **não grava a Week**.
2. A programação semanal é feita manualmente no Excel.
3. A tela mostra somente `Week = semana atual`.
4. SYS e SUBSYS filtram a lista já limitada à semana atual.
5. Registrar ponto-a-ponto **não cria nova linha**.
6. Registrar ponto-a-ponto **não altera Week**.
7. O sistema encontra a linha pelo `TAG` e acrescenta uma nova linha de texto em `Logs`.
8. “Repetir ponto a ponto” também acrescenta um novo registro em `Logs`.
9. Os campos A–I permanecem intactos.
10. TAG deve ser única.
11. Na referência de negócio usada no projeto: 07/09/2026 = W132 e 14/09/2026 = W133.

## Integração Power Automate

No `app.js`, configure:

```js
const CONFIG = {
  DATA_URL: "URL_DO_FLOW_DE_LEITURA",
  WRITE_URL: "URL_DO_FLOW_DE_GRAVACAO_PONTO_A_PONTO",
  TABLE_NAME: "tbPontoAPonto",
  LOGIN_TABLE: "tbLogin"
};
```

Apenas URLs de endpoints seguros. Não inserir credenciais no frontend.

### Leitura
O flow de leitura deve consultar a tabela `tbPontoAPonto` e retornar um JSON de linhas. O frontend aceita:
- array direto; ou
- objeto `{ "value": [...] }`; ou
- objeto `{ "rows": [...] }`.

### Gravação
O flow recebe:

```json
{
  "TAG": "ZSH-20GHA10AA401-S12",
  "PONTO-A-PONTO": "14/09/2026 08:32:00"
}
```

No Excel, o flow deve localizar a linha usando `TAG` como chave e atualizar somente `PONTO-A-PONTO` (coluna J).

### Login
Para produção, o login deve consultar `tbLogin` e aceitar somente:
- NOME informado;
- CRACHA informado;
- ATIVO = `SIM`.

O login do arquivo atual é apenas um mock visual para a Rev. 2.

## Desenvolvimento local

Abra `index.html` ou hospede a pasta em Vercel.

## GitHub

Depois de substituir os arquivos no repositório local:

```powershell
cd "C:\Users\thiago.moraes\Downloads\controle-ponto-a-ponto"
git status
git add index.html app.js styles.css README.md
git commit -m "Implementa revisao 2 do controle de ponto a ponto"
git push origin main
```

O GitHub documenta `git push origin main` como o fluxo normal para enviar commits locais ao repositório remoto.


## Integração com Power Automate — consulta

A consulta de equipamentos usa a API `/api/consultar` do Vercel.
A URL do Power Automate **não fica no `app.js`**.

No Vercel, configure a variável de ambiente:
`PPA_CONSULTAR_URL` = URL HTTP POST do fluxo `PPA - Consultar Equipamentos`.

O frontend envia `{ "week": "W133" }` para `/api/consultar`.
A função do Vercel repassa a semana ao Power Automate e devolve as linhas do Excel.

O fluxo do Power Automate deve usar a coluna `WEEK` no filtro:
`WEEK eq '@{triggerBody()?['week']}'`


## Variáveis de ambiente da Vercel

Configure em Production:

- `PPA_LOGIN_URL` — URL do fluxo **PPA - Login**
- `PPA_CONSULTAR_URL` — URL do fluxo **PPA - Consultar Equipamentos**
- `PPA_REGISTRAR_URL` — URL do fluxo **PPA - Registrar Ponto a Ponto**

O navegador chama apenas `/api/login`, `/api/consultar` e `/api/registrar`; as URLs dos Power Automate não ficam expostas no JavaScript.

### Regras de gravação

- Não cria nova linha no Excel.
- Localiza a linha pela coluna `TAG`.
- Atualiza `PONTO-A-PONTO` com somente a data (`dd/MM/yyyy`).
- Acrescenta em `Logs` o usuário + data + hora, preservando o histórico anterior.
- `WEEK` não é alterado.


### Exclusão do último ponto a ponto
A interface usa `/api/excluir`, protegido pela variável de ambiente `PPA_EXCLUIR_URL`. O fluxo deve localizar a TAG, remover apenas o último registro do Logs do usuário autenticado e restaurar J para a data do registro anterior (ou vazio se não houver outro registro).
