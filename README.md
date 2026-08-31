# Financeiro Pessoal

Aplicação web privada para consolidar Inter, Mercado Pago, cartão, reservas e pagamentos feitos por terceiros.

## Arquitetura

- Frontend estático (HTML/CSS/JavaScript), ideal para GitHub Pages.
- Supabase Auth para e-mail + senha.
- Supabase Postgres com RLS para isolamento por usuário.
- Edge Function `parse-finance-import` para interpretar extratos.

## Publicar no GitHub Pages

1. Crie um repositório no GitHub.
2. Envie os arquivos deste diretório para a branch `main`.
3. Em **Settings → Pages**, escolha **Deploy from a branch**, branch `main`, pasta `/ (root)`.
4. Após a publicação, no Supabase vá em **Authentication → URL Configuration** e cadastre a URL do GitHub Pages como **Site URL** e em **Redirect URLs**.

Não há chave secreta no frontend. A chave `sb_publishable_...` é uma chave pública de cliente; a proteção dos dados é feita pelo login e pelas políticas RLS do banco.

## Primeiro acesso

Na tela inicial, use **Primeiro acesso** para criar seu usuário. O trigger do Supabase cria automaticamente as contas e categorias padrão.

## Importação suportada

- Inter conta corrente CSV
- Inter conta corrente OFX
- Inter cartão CSV

O painel verifica duplicidades antes de confirmar a importação.

## Pagamento por terceiro

Em **Novo lançamento → Pago por terceiro**, o sistema registra a despesa na visão financeira real sem alterar o saldo bancário. É o fluxo indicado para aluguel/condomínio pagos diretamente por terceiro.
