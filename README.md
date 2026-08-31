# Financeiro Pessoal

Aplicação web privada para consolidar contas bancárias, cartões, Mercado Pago, benefícios, pagamentos feitos por terceiros e compras com múltiplas formas de pagamento.

## O que esta versão faz

- Login, cadastro e recuperação de senha com Supabase Auth.
- Isolamento de dados por usuário com RLS.
- Dashboard mensal com visão financeira real ou somente contas bancárias.
- Separação entre entradas em dinheiro e benefícios.
- Orçamento mensal editável.
- Importação de extratos Inter em OFX/CSV, com deduplicação e revisão de categorias.
- Fila de transações que precisam de revisão.
- Edição de transações sem apagar a descrição original do extrato.
- Nome amigável, categoria, tags, observação e tipo de movimentação.
- Criação de regras automáticas de categorização a partir de uma correção.
- Agrupamento de múltiplos pagamentos em uma única compra.
- Sugestões de agrupamento por estabelecimento/data.
- Divisão de compras por categorias sem alterar o total financeiro.
- Detalhamento de compras opcional nos gráficos.
- Upload privado de nota fiscal/PDF/XML/imagem ligado à compra.
- Conta separada para Cartão Alimentação / benefício.
- Registro de gastos pagos por terceiros, como aluguel e condomínio.
- Cadastro e edição de contas adicionais.

## Arquivos do site

- `index.html` — estrutura da aplicação.
- `styles.css` — design responsivo.
- `app.js` — autenticação, dashboard, edição, importação e integração Supabase.

## Publicação no GitHub Pages

O repositório deve publicar a branch `main` a partir de `/ (root)`.

Para atualizar uma versão já publicada, substitua no repositório os arquivos `index.html`, `styles.css` e `app.js` pelos arquivos desta pasta e faça um novo commit. O GitHub Pages republica automaticamente.

## Segurança

O frontend usa somente a chave `publishable` do Supabase. O acesso aos dados é controlado pelas políticas RLS do banco. Nunca coloque uma chave `service_role` ou `sb_secret_...` neste repositório.
