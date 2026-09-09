# Jarvis 1.0 Release Candidate

Este repositório contém o candidato web do assistente pessoal Jarvis: painel/PWA, memória e dados no Supabase, agenda no Google Calendar, arquivos/Docs/Sheets no Google Drive, OCR no Document AI e inteligência/orquestração por Edge Functions + OpenAI.

Status oficial enquanto o número Meta permanecer pendente: **Jarvis 1.0 RC Web, WhatsApp aguardando liberação externa**. Não usar a tag `1.0.0` antes da validação live ponta a ponta do WhatsApp.

Documentação operacional:

- `docs/architecture-1.0.md`
- `docs/operations-runbook.md`
- `docs/backup-recovery.md`
- `docs/acceptance-matrix.md`

Validação local:

```bash
npm run test:rc
bash scripts/verify-repository.sh
```

## Frontend GitHub Pages / PWA

Arquivos publicados diretamente na raiz do GitHub Pages incluem:

- `index.html`
- `app.js`
- `attention-rules.js`
- `domain-ui.js`
- `jarvis-domain-client.js`
- `jarvis-files-client.js`
- `files-ui.js`
- `document-intelligence-core.js`
- `document-intelligence.js`
- `document-intelligence.css`
- `styles.css`
- `jarvis-avatar.png`
- `manifest.webmanifest`
- `sw.js`
- `pwa.js`
- `icons/`

O service worker mantém somente o shell público e assets estáticos em cache. Requisições Supabase/Google/OpenAI e qualquer request com autorização ficam em modo de rede e nunca entram no cache.

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

## v3.5.0

- Google Drive permanece a fonte real dos arquivos; o Supabase armazena apenas metadados e contexto em `jarvis_files`.
- OAuth permanece separado por `provider = google_drive`, limitado a `drive.metadata.readonly`; Calendar nao foi ampliado nem misturado.
- `jarvis_files` usa `UNIQUE (user_id, provider, provider_file_id)`, FK composta de ownership para Projetos, `ON DELETE SET NULL`, RLS completa e trigger de `updated_at`.
- `jarvis-drive` e a camada canonica para metadados: leitura remota, busca, paginacao, refresh de token, sincronizacao idempotente e vinculo/desvinculo de projeto.
- A tela Arquivos abre somente lendo metadados ja sincronizados. A sincronizacao com o Drive acontece apenas no clique explicito em `Atualizar arquivos`.
- Nenhuma rota de download, upload, edicao, exclusao ou leitura de conteudo do Drive existe nesta versao.
- Projetos exibem os mesmos registros canonicos de `jarvis_files`; nao existe tabela paralela de arquivos por projeto.
- Consultas do Jarvis sobre localizacao de arquivos usam somente nome, tipo, projeto, datas e `web_view_link`; nao interpretam conteudo.
- Falha do Drive fica isolada do restante do painel e nao derruba Home, Projetos ou dados ja sincronizados.
- OCR, Vision, Document AI, embeddings e leitura semantica permanecem fora do escopo.

## v3.6.0

- `jarvis_files` continua sendo a fonte canonica do arquivo e do contexto; `jarvis_document_processing` guarda somente a interpretacao ligada por `jarvis_file_id`.
- Google Drive continua indexado com `drive.metadata.readonly`; leitura de conteudo usa somente `drive.file`, nunca `drive.readonly`, e apenas depois de selecao explicita pelo Google Picker.
- O access token do Picker e efemero, fica somente em memoria do navegador e nao e salvo em URL, banco ou armazenamento local.
- O backend baixa PDF/JPG/PNG temporariamente em memoria, limite de 20 MB, e nao persiste binarios no Supabase Storage nem no Cloud Storage.
- O OCR usa Enterprise Document OCR no Document AI, regiao `us`, via worker Cloud Run keyless com service account dedicada e permissao minima.
- A interpretacao estruturada usa OpenAI Responses API com `store:false` e cobre somente financeiro, contrato/administrativo e viagem.
- A tela Arquivos ganha estado de processamento, `Ler documento`, resumo, campos extraidos, texto completo recolhido, erro isolado e reprocessamento explicito.
- Abrir Home, Arquivos, Projetos ou Jarvis nao inicia OCR nem processamento.
- O Jarvis consulta somente documentos ja processados e nunca cria automaticamente transacao, tarefa, evento ou vinculo derivado.
- Custos registram paginas OCR e estimativa de preco de tabela para acompanhamento dos primeiros testes reais.
- Embeddings, busca vetorial, memoria semantica global e processamento automatico em massa continuam fora do escopo.
