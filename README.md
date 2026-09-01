# Financeiro Pessoal v2.2.11

Atualização focada em separar fluxo mensal de saldo/patrimônio acumulado.

## Novidades
- Tela Contas mostra **saldo atual** independente do mês selecionado.
- Inter Conta Corrente inicia em R$ 8,00, usando o saldo final do extrato de 31/08.
- Mercado Pago Saldo inicia em R$ 0,00, usando o saldo final do PDF.
- Cartão Alimentação inicia em R$ 601,00, como saldo atual confirmado.
- Mercado Pago Cofrinho mostra R$ 2.220,80 e continua ligado à posição de investimento.
- Extratos futuros do Inter Conta atualizam automaticamente o saldo quando o CSV trouxer saldo pós-transação.
- PDFs do Mercado Pago atualizam automaticamente o saldo final.
- Prints do Cofrinho com saldo reconhecido atualizam a posição e o saldo da conta.
- O editor de Contas permite corrigir/confirmar manualmente saldo e data do saldo.

## Publicação
Substitua no GitHub Pages:
- index.html
- app.js
- styles.css


## v2.2.11
- Resumo automático no final da lista de transações quando houver filtro ativo.
- Para despesas: total gasto, quantidade de lançamentos e ticket médio.
- Para receitas: total recebido, quantidade e valor médio.
- Para filtros mistos: entradas, saídas e saldo líquido.
- Transferências internas são mostradas, mas não distorcem o somatório financeiro.


## v2.2.11
- Gráfico de Evolução financeira interativo: hover/toque mostra data e valor acumulado do dia.
- Tooltip navegável também por teclado.


## v2.3.0 - Jarvis Lab
- Novo item Jarvis no menu.
- Simulador autenticado dentro do painel.
- Conversa salva em jarvis_messages.
- Chamada ao Edge Function jarvis-core.
- OpenAI opcional via segredo OPENAI_API_KEY; sem a chave, usa regras locais apenas para validar o roteamento.
- WhatsApp continua desacoplado e sera conectado depois pela identidade do usuario.
