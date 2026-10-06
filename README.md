# Controle Ponto a Ponto — Rev. 3

Entrega da nova estrutura de telas:

## 1. Dashboard — Previsto x Realizado

Tela administrativa com:
- KPIs de previsto, realizado, saldo e percentual de realização.
- Comparativo semanal em barras.
- Anel de progresso da semana atual.
- Quebra por atividade: Ponto a Ponto, Loop Teste e Preservação.
- Últimas execuções registradas.

## 2. Programação — imput de atividades

Tela administrativa para cadastrar atividades:
- Semana
- Data prevista
- Atividade
- Equipe
- Responsável
- Quantidade prevista
- Observação

As programações ficam em `localStorage` neste protótipo para facilitar a validação visual/funcional. O módulo já foi separado para futura gravação em `tb_programacoes`.

Exemplo de equipes/atividades:
- Equipe A → Ponto a Ponto
- Equipe B → Loop Teste
- Equipe C → Preservação

## 3. Login separado — Administrador x Técnico

A primeira tela agora apresenta dois acessos distintos:

### Administrador
Login por e-mail + senha (mock local nesta entrega).

### Técnico
Login por código de acesso (mock local nesta entrega).

O código do técnico é o ponto de entrada previsto para consultar `tb_acessos`, `tb_pessoas` e `tb_permissoes` na integração final.

## Base atual preservada

O módulo técnico de Ponto a Ponto, Histórico e Perfil continua disponível e mantém o fluxo da revisão anterior.

## Integração Supabase

O arquivo `app.js` já possui:

```js
const CONFIG = {
  SUPABASE_URL: "",
  SUPABASE_ANON_KEY: ""
};
```

A etapa seguinte de backend deve ligar:

- `tb_atividades`
- `tb_equipes`
- `tb_equipe_membros`
- `tb_pessoas`
- `tb_acessos`
- `tb_permissoes`
- `tb_programacoes`
- `tb_execucoes_campo`

ao frontend.

**Importante:** o controle visual de perfil feito em JavaScript é apenas demonstrativo. Em produção, a autorização precisa ser aplicada no backend/RLS e não apenas no frontend.

## Desenvolvimento local

Abra `index.html` diretamente ou publique a pasta em Vercel.

## Git

```powershell
cd "C:\Users\thiago.moraes\Downloads\controle-ponto-a-ponto"
git status
git add index.html app.js styles.css README.md
git commit -m "Adiciona dashboard programacao e login por perfil"
git push origin main
```
