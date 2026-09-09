# Checkpoint seguro — Jarvis 1.0 RC

Data: 2026-09-09 10:32:52 UTC

## Estado Git

- Branch local: `jarvis-1.0-rc`
- Commits de implementação locais: `8d0a402` (programa RC), `273f7ab` (fechamento dos gaps de validação) e `39f4a98` (checkpoint anterior). O checkpoint operacional é o `HEAD` da branch.
- PR: ainda não criado.
- Push: bloqueado pela política do ambiente antes de transmitir o repositório privado ao GitHub. Não repetir sem autorização explícita para enviar o conteúdo desta branch ao repositório `tg-cardososilva/financeiro-pessoal`.
- Baseline remoto: `origin/main` em `08dbf0aa`.

## Blocos concluídos no código

- Cérebro canônico com roteamento e retrieval determinísticos por domínio.
- Escritas de Tarefas, Notas e Projetos unificadas no serviço canônico.
- Criação idempotente de Google Docs/Sheets dentro da árvore JARVIS.
- Pesquisa com fontes, consolidação e entregável.
- Memória explícita, deduplicada, revisável e sem histórico indiscriminado.
- Atenção canônica independente da interface.
- Política de ações e confirmação explícita/claim atômico do Calendar.
- Reconstrução: 29 migrations e todas as 16 Edge Functions versionadas.
- Backup lógico criptografado e restore isolado automatizados/documentados.
- Observabilidade, incluindo consulta read-only da WABA/Phone Number ID na Meta Graph API.
- Finanças: totais exatos por pesquisa e comparação com período anterior.
- Pipeline WhatsApp completo com identidade autenticada, HMAC, replay/idempotência e sender com claim atômico.
- Revisão de UX e PWA instalável usando o mesmo frontend/dados.
- Matriz automatizada de aceite e CI unificado.

## Produção Supabase — não repetir

- Migrations aplicadas:
  - `20260908194326_jarvis_1_0_rc_foundation`
  - `20260909004017_jarvis_1_0_rc_cover_owner_foreign_keys`
  - `20260909005233_jarvis_finance_exact_search_totals`
- Edge Functions ativas relevantes:
  - `jarvis-domain` v7
  - `jarvis-core` v18
  - `jarvis-attention` v1
  - `jarvis-deliverables` v1
  - `jarvis-memory` v1
  - `jarvis-health` v3
  - `jarvis-calendar` v13
  - `jarvis-whatsapp-identity` v1
  - `jarvis-whatsapp-send` v9
  - `jarvis-whatsapp-webhook` v12 (`verify_jwt=false`, autenticação HMAC própria)
- Não reaplicar migrations nem refazer esses deploys sem mudança de fonte.
- Não repetir fixtures SQL anteriores: foram executadas em transações com `ROLLBACK`.
- Não ampliar OAuth: `drive.file` existente atende Docs/Sheets.
- Não alterar WABA, Phone Number ID, token, templates ou registro Meta.

## Validações concluídas

- 59/59 testes locais aprovados.
- Syntax checks de frontend/PWA e worker Python aprovados.
- Reconstrução do repositório aprovada com 29 migrations.
- `git diff --check` aprovado.
- RPC financeiro comparado a agregação SQL direta: `matched_totals` e contagem exatos.
- Probes: nove endpoints privados retornam 401 sem JWT; webhook retorna 401 sem HMAC.
- Security Advisor: somente quatro tabelas backend-only com RLS sem policy (intencional) e proteção de senhas vazadas desativada no plano atual.
- Performance Advisor: 31 FKs legadas sem índice; nenhuma FK nova do RC permanece sem índice. Índices novos ainda aparecem como não usados por não haver carga após criação.
- Tipos TypeScript gerados em `supabase/database.types.ts`.
- Deploy remoto compilou todas as fontes alteradas.

## Validações live autenticadas desta retomada

- Integridade inicial confirmada antes de qualquer ação: branch `jarvis-1.0-rc`, `HEAD` `39f4a98` e working tree limpa.
- Login seguro concluído no painel de produção com a conta esperada; nenhuma credencial foi exposta ou registrada.
- `jarvis-core` + OpenAI + retrieval financeiro: respostas reais confirmadas para setembro de 2026 (`R$ 0,00`) e agosto de 2026 (`R$ 13.117,71`).
- Calendar leitura: consulta de amanhã concluída sem erro e sem compromissos retornados.
- Drive leitura/sincronização: conexão da conta confirmada; sincronização explícita concluída; a raiz `Meu Drive / JARVIS` estava vazia e permaneceu com zero arquivos indexados.
- Arquivos/Documentos: consulta por contrato retornou corretamente que não havia dado correspondente, sem inventar resultado.
- Contrato de confirmação do Calendar: o evento `[TESTE JARVIS RC] Calendar 2026-09-10`, em 10/09/2026 das 14:00 às 14:30, foi apenas preparado e permanece pendente. Não foi criado no Google Calendar.
- Docs live: o Drive criou o arquivo nativo `[TESTE JARVIS RC] Documento 2026-09-09`, mas a etapa Docs API falhou com `google_permission_denied` (HTTP 403). Registro `491135c3-eca5-411f-8d49-22ce4c63a1ab`; provider file `1Tcr-ABfeB7FSAPgb3g_Q94pnGiBxJbujiGZzqUfWAjk`.
- Sheets live: o Drive criou o arquivo nativo `[TESTE JARVIS RC] Planilha 2026-09-09`, mas a etapa Sheets API falhou com `google_permission_denied` (HTTP 403). Registro `ffa0d681-b1ff-4eee-9860-d218e0d2da66`; provider file `1SgEYSjKCFhv3SqFDhKFABv1CWiWR3dcgqz1Gbs0KzF8`.
- Escopos persistidos conferidos sem ler tokens: a conexão Drive contém `drive.file` e `drive.metadata.readonly`; portanto, não há justificativa para ampliar OAuth. A evidência conjunta (Drive cria; Docs e Sheets recusam com 403) aponta para APIs Docs/Sheets desativadas ou bloqueadas no projeto Google Cloud do OAuth. A mensagem detalhada do provedor ainda não é persistida, então essa causa é provável, não confirmada pelo campo original da Google.
- Document AI live não foi iniciado: não existe PDF/JPG/PNG controlado na raiz JARVIS. O health/configuração depende da UI RC ainda não publicada.
- Tentativa read-only de abrir o Google Cloud Console não alcançou o domínio a partir do navegador deste ambiente; nenhuma configuração foi alterada.
- Pré-flight de backup reconfirmado: `pg_dump`, `pg_restore`, `age` e Docker ausentes; `SUPABASE_DB_URL`, `BACKUP_AGE_RECIPIENT` e `BACKUP_AGE_IDENTITY` não configurados.

## Pendências bloqueadas

- `jarvis-health` e estado técnico Meta: a sessão autenticada foi obtida, mas o frontend de produção ainda é o baseline anterior e não expõe a tela/chamada do health RC. Executar imediatamente após publicar a branch; não criar endpoint público nem extrair token da sessão.
- Calendar live de escrita: evento controlado preparado e pendente. Clicar em **Confirmar** cria um compromisso externo e exige confirmação do usuário no momento da ação. Depois, a eventual remoção do evento de teste também exige confirmação.
- Docs/Sheets: os dois formatos falham com 403 depois da criação bem-sucedida no Drive. Menor ação manual provável: verificar/habilitar Google Docs API e Google Sheets API no mesmo projeto Google Cloud do OAuth, sem mudar escopos, client, token ou Drive. Depois, retestar uma vez cada com novos nomes/idempotency keys.
- Dois arquivos nativos de teste podem estar vazios no Drive. Não recriar e não excluir sem confirmação explícita no momento da exclusão.
- Estado técnico real da Meta: `jarvis-health` está pronto para consultar `status`, `code_verification_status`, nome, qualidade, limites e review/compliance, mas depende da publicação do frontend RC para chamada autenticada segura.
- WhatsApp live ponta a ponta: depois do health, exige pareamento autenticado e uma mensagem real do usuário; nenhuma alteração no número será feita.
- Backup/restore real: faltam `SUPABASE_DB_URL`, recipient/identity `age` e os binários operacionais (`pg_dump`, `pg_restore`, `age`, Docker). Os scripts falham fechados sem isso.
- Push/PR/CI/merge/GitHub Pages: transmissão ao GitHub foi bloqueada pela política do ambiente e requer autorização explícita para este destino e payload.
- PWA visual/live: o navegador em nuvem não alcança o servidor localhost; validar após publicação no GitHub Pages.

## Operações que não devem ser repetidas

- Não reaplicar as três migrations, não refazer os deploys listados e não repetir fixtures SQL históricas.
- Não reenviar os pedidos que criaram os arquivos Docs/Sheets acima: eles já produziram provider files e registros de falha próprios.
- Não reenviar o pedido do Calendar: já existe exatamente uma ação pendente aguardando confirmação.
- Não repetir os smoke tests financeiros, a consulta de agenda de amanhã, a busca por contrato nem a sincronização vazia do Drive, salvo regressão após publicação.
- Não tentar ampliar scopes OAuth: `drive.file` já está concedido.
- Não alterar WABA, Phone Number ID, access token, templates, registro ou vínculo com WhatsApp Business mobile.
- Não tentar publicar ou enviar a branch sem autorização explícita para o repositório privado `tg-cardososilva/financeiro-pessoal`.

## PONTO EXATO PARA RETOMADA

1. Receber autorização explícita para enviar a branch ao repositório privado `tg-cardososilva/financeiro-pessoal`; então pushar `jarvis-1.0-rc`, criar PR, rodar CI, corrigir somente regressões, mergear e aguardar GitHub Pages.
2. Na UI RC publicada e com login seguro, executar `jarvis-health` primeiro. Registrar o estado Meta exato e os checks de Calendar, Drive, OpenAI, Cloud Run e Document AI, sem alterar integrações.
3. Validar instalação/atualização PWA e viewports iPhone/Android na URL publicada; repetir apenas os smokes mínimos necessários para confirmar ausência de regressão.
4. Após habilitação manual das APIs Google Docs/Sheets, criar um novo Docs e um novo Sheets de teste uma única vez. Não repetir os dois pedidos/IDs já falhos.
5. Com confirmação de ação externa, clicar uma única vez em **Confirmar** no evento Calendar já pendente. Validar criação; remover artefatos de teste somente com confirmação específica de exclusão.
6. Com `SUPABASE_DB_URL`, chaves `age` e binários disponíveis, executar backup criptografado e restore Docker isolado sem tocar produção.
7. Se `jarvis-health` confirmar `phone_status=CONNECTED`, completar pareamento autenticado e WhatsApp live com mensagem real do usuário; caso contrário, registrar o campo Meta bloqueador e encerrar como **Jarvis 1.0 RC Web, WhatsApp aguardando liberação externa**.
8. Não marcar `1.0.0` antes do WhatsApp live.
