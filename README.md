# Planning Pro

Sistema de gerenciamento de atividades e programação de campo.

## Stack

- Frontend: React + Vite
- Banco de dados: Supabase PostgreSQL
- Autenticação: Supabase Auth
- Arquivos/evidências: Supabase Storage
- Hospedagem: Vercel

## Arquitetura

GitHub
  ?
Vercel
  ?
Planning Pro
  ?
Supabase
  +-- PostgreSQL
  +-- Auth
  +-- Storage

## Módulos

- Dashboard
- Programação
- Nova Programação
- Execução em campo
- Histórico
- Cadastro de Pessoas
- Cadastro de Equipes
- Cadastro de Atividades

## Desenvolvimento

npm install

npm run build

## Variáveis de ambiente

VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=

Nunca versionar arquivos .env ou chaves secretas.
