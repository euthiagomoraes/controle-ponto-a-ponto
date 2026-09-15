# PPA - Dashboard Supervisor — fluxo otimizado

A interface foi ajustada para **não baixar a `tbPontoAPonto` inteira no navegador**.

O endpoint `/api/dashboard` envia ao Power Automate:

```json
{
  "perfil": "SUPERVISOR",
  "mode": "summary",
  "week": "",
  "forn": "",
  "sys": "",
  "subsys": ""
}
```

ou, para a programação detalhada:

```json
{
  "perfil": "SUPERVISOR",
  "mode": "schedule",
  "week": "W133",
  "forn": "",
  "sys": "",
  "subsys": ""
}
```

## Fluxo

Nome: **PPA - Dashboard Supervisor**

### 1. Trigger

`When an HTTP request is received`

Who can trigger: **Anyone**

Schema:

```json
{
  "type": "object",
  "properties": {
    "perfil": {"type": "string"},
    "mode": {"type": "string"},
    "week": {"type": "string"},
    "forn": {"type": "string"},
    "sys": {"type": "string"},
    "subsys": {"type": "string"}
  },
  "required": ["perfil", "mode"]
}
```

### 2. Compose — Filter Query

Adicione `Compose` e use **Expression**:

```text
concat(
  "(WEEK eq '", replace(coalesce(triggerBody()?['week'], ''), '''', ''''''), "' or '", replace(coalesce(triggerBody()?['week'], ''), '''', ''''''), "' eq '') and ",
  "(FORN_x002e_ eq '", replace(coalesce(triggerBody()?['forn'], ''), '''', ''''''), "' or '", replace(coalesce(triggerBody()?['forn'], ''), '''', ''''''), "' eq '') and ",
  "(SYS eq '", replace(coalesce(triggerBody()?['sys'], ''), '''', ''''''), "' or '", replace(coalesce(triggerBody()?['sys'], ''), '''', ''''''), "' eq '') and ",
  "(SUBSYS eq '", replace(coalesce(triggerBody()?['subsys'], ''), '''', ''''''), "' or '", replace(coalesce(triggerBody()?['subsys'], ''), '''', ''''''), "' eq '')"
)
```

A lógica é: filtro vazio = condição verdadeira; filtro preenchido = restringe a consulta.

### 3. List rows present in a table

Use:

- Location: `OneDrive for Business`
- Document Library: `Documentos`
- File: `/Área de Trabalho/CONTROLE DE LOOPTEST.APP/Base de Dados - Ponto a Ponto.xlsx`
- Table: `tbPontoAPonto`
- Filter Query: **Output** do Compose `Filter Query`

Em `Settings`, ligue **Pagination** e use **5000** como limite máximo permitido pela ação.

### 4. Condition — modo schedule

Condição:

```text
triggerBody()?['mode'] is equal to schedule
```

#### TRUE — programação detalhada

Adicione `Response`:

Status `200`

Body (texto normal com o array inserido por conteúdo dinâmico):

```json
{
  "mode": "schedule",
  "rows": [conteúdo de value da ação List rows]
}
```

A programação somente busca as linhas que atendem aos filtros, normalmente começando pela semana selecionada.

#### FALSE — resumo do dashboard

Adicione `Filter array` para realizado:

```text
@not(empty(item()?['PONTO-A-PONTO']))
```

Depois calcule:

- `previsto` = `length(body('List_rows_present_in_a_table')?['value'])`
- `realizado` = `length(body('Filter_array'))`
- `pendente` = `sub(variables/outputs de previsto, variables/outputs de realizado)`
- `percentual` = `if(equals(previsto,0),0,mul(div(float(realizado),float(previsto)),100))`

O resumo deve devolver apenas agregados. Não devolva as linhas completas no modo `summary`.

### 5. Response do resumo

Use:

```json
{
  "mode": "summary",
  "stats": {
    "previsto": 1000,
    "realizado": 327,
    "pendente": 673,
    "percentual": 32.7
  },
  "options": {
    "weeks": [],
    "forns": [],
    "sys": [],
    "subsys": []
  }
}
```

As listas `options` devem ser geradas a partir das linhas que o filtro atual trouxe. Para remover duplicados com Data Operations, use `Select` em modo texto e `union(outputs('Select_X'), outputs('Select_X'))` para cada dimensão.

## Regra do cálculo

Sem filtros:

- Previsto = toda a base retornada
- Realizado = `PONTO-A-PONTO` preenchido
- Pendente = `PONTO-A-PONTO` vazio
- Percentual = realizado / previsto

Com filtros, a mesma regra é aplicada apenas às linhas filtradas.

## Importante

O navegador carrega apenas os agregados no `mode=summary`. As linhas detalhadas só são buscadas no `mode=schedule`, quando o supervisor abre a programação.
