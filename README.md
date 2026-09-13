# Controle de Ponto a Ponto

Frontend responsivo para consulta de TAGs, registro de data/hora de PONTO-A-PONTO, histórico e perfil.

## Regra de dados
TAG = coluna E do Excel. PONTO-A-PONTO = coluna W e é a única coluna que o sistema poderá alterar.

## Estado atual
Protótipo funcional de interface: dados locais apenas. A integração real será feita depois com Vercel + Power Automate + Excel no OneDrive, mantendo segredos no servidor.

## Telas
- Início: busca por TAG, detalhes, registro, repetição e tabela rolável.
- Histórico: realizados x pendentes, gráfico por dia e log de alterações.
- Perfil: usuário e logout.
