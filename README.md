# Jarvis v3.3.1 - Requer atencao com dados reais

Arquivos para subir diretamente na raiz do repositorio GitHub Pages:

- `index.html`
- `app.js`
- `attention-rules.js`
- `styles.css`
- `jarvis-avatar.png`

Nao crie pasta `assets`.

## Melhorias visuais

- `Financas` virou um item principal recolhivel. Ao clicar, abre o submenu com Visao geral, Transacoes, Compras, Investimentos, Contas e Importar extratos.
- O submenu financeiro abre automaticamente quando uma tela financeira esta ativa e lembra a preferencia de abertura.
- `Em evolucao` tambem virou um grupo recolhivel para reduzir ruido visual.
- O card grande de ajuda da sidebar foi substituido por um status compacto do WhatsApp.
- O botao flutuante do Jarvis fica compacto e expande apenas ao passar o mouse. Na Home e na propria tela do Jarvis ele fica oculto para evitar duplicacao.
- Sidebar ficou um pouco mais estreita, com espacamentos e hierarquia mais leves.
- A saudacao do perfil atual agora prioriza `Thiago` antes do nome salvo no perfil, evitando exibir `tgcs.business`.

Depois de publicar, use `Command + Shift + R`.

## v3.2.2

- Remove a rotina temporária que reconhecia, escondia e apagava dados de teste do Jarvis.
- `loadJarvisData()` volta a ser somente leitura.
- Mantém deduplicação genérica de ações e anotações para proteção visual.
- Regra arquitetural: abrir ou atualizar uma tela nunca apaga dados automaticamente.

## v3.3.0

- Home lê eventos reais do Google Calendar por uma Edge Function dedicada e somente leitura.
- Eventos são separados em Hoje, Amanhã e Próximos dias.
- Eventos reais e `jarvis_actions` propostas aparecem como fontes distintas.
- Falhas do Calendar degradam apenas o bloco de agenda, sem derrubar a Home.
- Datas e horários do Calendar usam `America/Sao_Paulo`.
- A camada visual deduplica eventos por `id + start`.
- Perguntas de agenda do Jarvis usam a mesma fonte `jarvis-calendar-read`; pedidos de escrita continuam no fluxo com confirmação.
- Atualizar a Home não cria, altera, cancela ou apaga eventos.

## v3.3.1

- `Requer atenção` passa a ser derivado exclusivamente de dados reais já existentes.
- Regras cobrem tarefas vencidas/próximas, ações propostas, transações para revisão, compromissos próximos, anotações financeiras pendentes e falhas de integração.
- Itens recebem urgência `Urgente`, `Alta`, `Média` ou `Baixa` e são ordenados por score e prazo.
- Transações e anotações repetitivas são consolidadas; registros individuais usam chaves estáveis para evitar duplicidade.
- A busca global de transações para revisão é somente leitura e independente do mês selecionado.
- Nenhum dado de teste persistente é criado. Os testes das regras usam apenas fixtures em memória.
- A Home continua somente leitura.
