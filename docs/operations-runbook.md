# Operação e reconstrução — Jarvis 1.0 RC

## Bootstrap de um ambiente novo

1. Instale Supabase CLI, Node 22, Deno 2, PostgreSQL client 17, `age` e Docker.
2. Crie um projeto Supabase e associe o diretório com `supabase link --project-ref <ref>`.
3. Aplique, em ordem, todos os arquivos de `supabase/migrations/` com `supabase db push`.
4. Cadastre os secrets listados em `.env.example`; valores nunca pertencem ao Git.
5. Faça deploy de cada diretório em `supabase/functions/`. Respeite `verify_jwt` em `supabase/config.toml`.
6. Configure os callbacks Google para as funções OAuth e a URL do painel em `JARVIS_APP_URL`.
7. Habilite Google Calendar API, Drive API, Docs API, Sheets API e Document AI. O consentimento existente usa `calendar.events`, `drive.metadata.readonly` e `drive.file`; Docs/Sheets não exigem escopo mais amplo.
8. Publique os arquivos da raiz em GitHub Pages. O PWA é o mesmo frontend e exige HTTPS.
9. Configure o worker em `cloud-run/jarvis-document-ai-worker/` e conceda à service account somente acesso ao processor Document AI necessário.
10. Configure o webhook Meta sem alterar WABA/número/templates. `jarvis-health` consulta a WABA/Phone Number ID somente para leitura e diferencia registro técnico de discrepância visual no Gerenciador.

## Inventário de Edge Functions

| Função | JWT | Responsabilidade |
|---|---:|---|
| `jarvis-core` | sim | cérebro canônico e retrieval |
| `jarvis-domain` | sim | CRUD canônico de tarefas/notas/projetos |
| `jarvis-attention` | sim | saída canônica de atenção |
| `jarvis-deliverables` | sim | criação idempotente de Docs/Sheets |
| `jarvis-memory` | sim | memória explícita e deduplicada |
| `jarvis-health` | sim | saúde sanitizada por usuário |
| `jarvis-calendar`, `-read`, `-query` | sim | execução confirmada e leitura de agenda |
| `jarvis-drive` | sim | índice/escopo do Drive |
| `jarvis-document-processing` | sim | OCR/interpretação explícitos |
| `parse-finance-import` | sim | importação financeira |
| `jarvis-whatsapp-identity` | sim | pairing autenticado |
| `jarvis-whatsapp-send` | sim | envio derivado de ação confirmada |
| `jarvis-google-oauth`, `jarvis-google-drive-oauth` | não | início/callback OAuth com validações próprias |
| `jarvis-whatsapp-webhook` | não | endpoint Meta com HMAC e autorização própria |

## Saúde e incidentes

- Abra `Sistema` no painel e use `Verificar agora`.
- `blocked` exige ação humana; `degraded` indica falha transitória/integrada; `healthy` registra alcance e configuração mínima.
- Nenhum check grava token, telefone, texto de mensagem, assinatura, payload OCR ou valor de secret.
- Falhas acionáveis alimentam `jarvis-attention`; detalhes técnicos ficam fora da Home.
- Em incidente OAuth, reconecte somente o provider afetado. Não amplie escopos para corrigir refresh token.
- Em falha de OpenAI/Google/Cloud Run, preserve o banco; retries idempotentes evitam duplicar domínio e entregáveis.

## Release

1. Rode `npm run test:rc` e `bash scripts/verify-repository.sh`.
2. Valide a migration em transação/rollback antes de `supabase db push`.
3. Faça deploy das funções e probes autenticados controlados.
4. Rode Security e Performance Advisors; trate erros de segurança como bloqueantes.
5. Valide PWA em viewport iPhone/Android e atualização do service worker.
6. Gere backup lógico criptografado e conclua o teste isolado de restauração.
7. Com WhatsApp pendente, use o marco **Jarvis 1.0 RC Web, WhatsApp aguardando liberação externa**. Nunca marque `1.0.0` antes do teste live ponta a ponta.
