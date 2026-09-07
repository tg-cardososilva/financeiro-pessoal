# Jarvis v3.4.0b - Tarefas, Notas e Projetos operacionais

Arquivos para subir diretamente na raiz do repositorio GitHub Pages:

- `index.html`
- `app.js`
- `attention-rules.js`
- `domain-ui.js`
- `jarvis-domain-client.js`
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

## v3.4.0a

- Fecha o contrato estrutural oficial de Tarefas, Notas e Projetos no Supabase.
- Status, prioridade, origem e tipo de nota usam enums controlados.
- RLS e FK composta impedem associacao de tarefa ou nota a projeto de outro usuario.
- `jarvis-domain` vira a camada canonica de leitura e escrita dos tres dominios.
- Escritas exigem acao explicita; abrir ou atualizar tela continua somente leitura.

## v3.4.0b

- Tarefas, Notas & Ideias e Projetos viram modulos operacionais completos sem alterar o schema da v3.4.0a.
- O frontend passa a ler e escrever os tres dominios exclusivamente pelo `jarvis-domain`; nao ha acesso direto as tabelas `jarvis_tasks`, `jarvis_notes` ou `jarvis_projects`.
- Tarefas suportam criar, editar, concluir, reabrir, cancelar, excluir, buscar e filtrar por status, prioridade, prazo e projeto.
- Notas suportam criar, editar, excluir, tipos `note`/`idea`/`reference`, tags, projeto, busca por titulo/conteudo/tags e filtros.
- Projetos suportam criar, editar, pausar, concluir, reativar, arquivar e reabrir; exclusao fica secundaria e explicita no detalhe de edicao.
- Abrir um projeto mostra tarefas e notas relacionadas usando os mesmos registros canonicos, sem fonte paralela.
- Metadados tecnicos (`source`, ID e timestamps) ficam apenas nos detalhes.
- Home continua usando `state.jarvis.tasks`, `state.jarvis.notes` e `state.jarvis.projects`, agora carregados pela fonte canonica; `attention-rules.js` continua puro.
- O frontend deixa de depender de `pending`, prioridade numerica, `remind_at`, `project_type`, `target_date` ou outros campos legados destes dominios.
- Testes de frontend cobrem filtros, busca, cliente canonico, `explicit: true`, integracao com `attention-rules.js` e auditoria de carregamento somente leitura.
- Testes de banco cobrem CRUD e transicoes em transacao revertida, incluindo associacao valida e rejeicao de `project_id` cruzado. Nenhum dado artificial fica persistido.
