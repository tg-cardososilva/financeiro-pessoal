# Checkpoint seguro — Jarvis 1.0 RC

Data: 2026-09-09 11:56:43 UTC

## Estado Git

- Branch local: `jarvis-1.0-rc`
- HEAD local: `6e627e1` na branch `jarvis-1.0-rc`; working tree limpa antes desta atualização do checkpoint.
- Commits desta retomada após `39f4a98`: `0a15337`, `65fff48`, `383cd1f`, `e8006c7`, `22d333c`, `7becc9b`, `ceea4db`, `9253f13` e `6e627e1`.
- PR #11: programa Jarvis 1.0 RC, mergeado em `main` pelo commit `6ff86a36eab689539efeccaa8ff62413e46f94bb`.
- PR #12: hotfix GitHub Pages/PWA, mergeado em `main` pelo commit `758b4aee3e3837eb734439a0500a4f95390d98ce`.
- GitHub Pages publicado com sucesso no run `34346875251`; a URL de produção serve o shell `1.0.0-rc.2`.

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
- CI do PR #11: `Jarvis 1.0 RC` e `v3.6.0 Regression` aprovados; workflows históricos corretamente ignorados.
- CI do PR #12: `Jarvis 1.0 RC` run 18 e `v3.6.0 Regression` run 28 aprovados.
- CI de `main` após o primeiro merge e após o hotfix aprovado; Pages publicado após ambos.
- Verificação de reconstrução repetida com sucesso: `repository_reconstruction_ok migrations=29`.
- Tipos Supabase regenerados e comparados ao arquivo versionado: conteúdo idêntico, salvo a quebra de linha final.
- Advisors em 09/09/2026: nenhum erro crítico. Segurança: quatro tabelas backend-only com RLS sem policy (negação intencional) e um warning de proteção contra senhas vazadas desativada. Performance: 31 FKs legadas sem índice e 21 índices ainda não usados, todos informativos para este RC.

## Validações live autenticadas desta retomada

- Integridade inicial confirmada antes de qualquer ação: branch `jarvis-1.0-rc`, `HEAD` `39f4a98` e working tree limpa.
- Login seguro concluído no painel de produção com a conta esperada; nenhuma credencial foi exposta ou registrada.
- `jarvis-core` + OpenAI + retrieval financeiro: respostas reais confirmadas para setembro de 2026 (`R$ 0,00`) e agosto de 2026 (`R$ 13.117,71`).
- Calendar leitura: consulta de amanhã concluída sem erro e sem compromissos retornados.
- Drive leitura/sincronização: conexão da conta confirmada; sincronização explícita concluída; a raiz `Meu Drive / JARVIS` estava vazia e permaneceu com zero arquivos indexados.
- Arquivos/Documentos: consulta por contrato retornou corretamente que não havia dado correspondente, sem inventar resultado.
- Calendar escrita ponta a ponta aprovada: a ação pendente foi confirmada uma única vez, o evento `[TESTE JARVIS RC] Calendar 2026-09-10` foi criado em 10/09/2026 das 14:00 às 14:30, localizado pela API com o horário correto e removido. A busca final retornou zero eventos; não há artefato Calendar remanescente.
- Docs live: o Drive criou o arquivo nativo `[TESTE JARVIS RC] Documento 2026-09-09`, mas a etapa Docs API falhou com `google_permission_denied` (HTTP 403). Registro `491135c3-eca5-411f-8d49-22ce4c63a1ab`; provider file `1Tcr-ABfeB7FSAPgb3g_Q94pnGiBxJbujiGZzqUfWAjk`.
- Sheets live: o Drive criou o arquivo nativo `[TESTE JARVIS RC] Planilha 2026-09-09`, mas a etapa Sheets API falhou com `google_permission_denied` (HTTP 403). Registro `ffa0d681-b1ff-4eee-9860-d218e0d2da66`; provider file `1SgEYSjKCFhv3SqFDhKFABv1CWiWR3dcgqz1Gbs0KzF8`.
- Escopos persistidos conferidos sem ler tokens: a conexão Drive contém `drive.file` e `drive.metadata.readonly`; portanto, não há justificativa para ampliar OAuth. A evidência conjunta (Drive cria; Docs e Sheets recusam com 403) aponta para APIs Docs/Sheets desativadas ou bloqueadas no projeto Google Cloud do OAuth. A mensagem detalhada do provedor ainda não é persistida, então essa causa é provável, não confirmada pelo campo original da Google.
- `jarvis-health` autenticado foi executado na UI RC publicada: Supabase, Calendar, Drive, OpenAI, Cloud Run, Document AI e webhook WhatsApp retornaram saudáveis. Document AI confirmou worker alcançável e processor configurado, mas não houve OCR live por inexistência de documento controlado.
- Meta Graph retornou HTTP 401 / provider code 190. O secret de ambiente consultado aponta para a WABA `1087496404047645`, divergente da WABA oficial informada `2536408923542027`. Logo, não foi possível ler `phone_status`, nome, qualidade, limites ou review; a menor ação é corrigir manualmente WABA/token configurados e executar o health uma vez. Nenhuma configuração Meta foi alterada.
- Tentativa read-only de abrir o Google Cloud Console não alcançou o domínio a partir do navegador deste ambiente; nenhuma configuração foi alterada.
- Pré-flight de backup reconfirmado: `pg_dump`, `pg_restore`, `age` e Docker ausentes; `SUPABASE_DB_URL`, `BACKUP_AGE_RECIPIENT` e `BACKUP_AGE_IDENTITY` não configurados.
- Publicação/PWA live: o primeiro deploy revelou 404 do módulo `_shared` pelo Jekyll; o PR #12 adicionou `.nojekyll`, manteve o módulo no shell seguro e renovou cache/assets para `rc.2`. Depois do deploy, login e Home voltaram a iniciar, manifest e service worker foram verificados na URL pública e o botão de instalação foi exibido.
- Viewport físico/iPhone/Android não foi emulado porque o navegador disponível não expõe redimensionamento; responsividade, safe areas, manifest, atualização de cache e política de não cachear dados autenticados permanecem cobertos pelos testes automatizados.
- Tentativa de excluir os dois arquivos nativos Docs/Sheets foi recusada pela proteção contra exclusão irreversível. Metadados confirmam que são `[TESTE JARVIS RC] Documento 2026-09-09` e `[TESTE JARVIS RC] Planilha 2026-09-09`, criados nos horários do teste e dentro da pasta JARVIS. Nenhuma exclusão ou limpeza de banco foi executada.

## Pendências bloqueadas

- Estado técnico Meta: bloqueado por configuração/credencial. `jarvis-health` provou WABA configurada divergente (`1087496404047645`) e token recusado com Graph code 190. Atualizar manualmente para os dados válidos da WABA oficial antes de novo health; não alterar número, templates nem registro.
- Docs/Sheets: os dois formatos falham com 403 depois da criação bem-sucedida no Drive. Menor ação manual provável: verificar/habilitar Google Docs API e Google Sheets API no mesmo projeto Google Cloud do OAuth, sem mudar escopos, client, token ou Drive. Depois, retestar uma vez cada com novos nomes/idempotency keys.
- Dois arquivos nativos de teste vazios permanecem no Drive. A exclusão foi rejeitada por risco; não repetir até existir autorização informada citando exatamente os dois nomes/IDs.
- WhatsApp live ponta a ponta: depois do health, exige pareamento autenticado e uma mensagem real do usuário; nenhuma alteração no número será feita.
- Backup/restore real: faltam `SUPABASE_DB_URL`, recipient/identity `age` e os binários operacionais (`pg_dump`, `pg_restore`, `age`, Docker). Os scripts falham fechados sem isso.
- Supabase Auth: proteção contra senhas vazadas aparece como warning do advisor. Recomendada quando disponível no plano/configuração; não bloqueia o RC pessoal com autenticação já validada.
- Instalação física PWA em iPhone/Android continua como aceite manual final; publicação e critérios técnicos foram validados.

## Operações que não devem ser repetidas

- Não reaplicar as três migrations, não refazer os deploys listados e não repetir fixtures SQL históricas.
- Não reenviar os pedidos que criaram os arquivos Docs/Sheets acima: eles já produziram provider files e registros de falha próprios.
- Não reenviar o pedido do Calendar e não tentar remover novamente o evento: o fluxo já foi validado e a limpeza terminou com busca vazia.
- Não repetir os smoke tests financeiros, a consulta de agenda de amanhã, a busca por contrato nem a sincronização vazia do Drive, salvo regressão após publicação.
- Não tentar ampliar scopes OAuth: `drive.file` já está concedido.
- Não alterar WABA, Phone Number ID, access token, templates, registro ou vínculo com WhatsApp Business mobile.
- Não repetir o push/PR/merge dos PRs #11 e #12 nem os deploys Pages já concluídos.
- Não repetir a exclusão Drive dos dois arquivos de teste sem nova autorização informada específica; a tentativa anterior foi recusada e não teve efeito.
- Não repetir `jarvis-health` até WABA/token serem corrigidos, pois o Graph code 190 é determinístico com a configuração atual.

## PONTO EXATO PARA RETOMADA

1. Corrigir manualmente os secrets Meta: validar o access token e alinhar `WHATSAPP_BUSINESS_ACCOUNT_ID` à WABA oficial `2536408923542027`, sem alterar número, templates ou registro. Depois executar `jarvis-health` uma única vez.
2. Se o health conseguir ler a Meta e retornar `phone_status=CONNECTED`, concluir pareamento autenticado e WhatsApp live com uma mensagem real do usuário. Caso contrário, registrar os campos retornados e manter o marco **Jarvis 1.0 RC Web, WhatsApp aguardando liberação externa**.
3. Habilitar/verificar Google Docs API e Google Sheets API no projeto GCP do OAuth. Retestar uma única vez cada com novos nomes e idempotency keys; não repetir os IDs falhos anteriores.
4. Para limpar o Drive, obter autorização informada específica para excluir permanentemente os arquivos `[TESTE JARVIS RC] Documento 2026-09-09` (`1Tcr-ABfeB7FSAPgb3g_Q94pnGiBxJbujiGZzqUfWAjk`) e `[TESTE JARVIS RC] Planilha 2026-09-09` (`1SgEYSjKCFhv3SqFDhKFABv1CWiWR3dcgqz1Gbs0KzF8`). Só depois excluir e remover os dois registros de falha correspondentes.
5. Disponibilizar `SUPABASE_DB_URL`, `BACKUP_AGE_RECIPIENT`, `BACKUP_AGE_IDENTITY`, PostgreSQL client 17, `age` e Docker; então executar backup criptografado e restore isolado sem tocar produção.
6. Fazer o aceite manual de instalação do PWA em um iPhone e um Android. Não há nova implementação prevista.
7. Não marcar `1.0.0` antes do WhatsApp live.
