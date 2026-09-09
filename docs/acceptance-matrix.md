# Matriz de aceite — Jarvis 1.0 RC

| Área | Critério | Automação | Live |
|---|---|---:|---:|
| Financeiro | gastos, receitas, categorias, saldos, investimentos, mês e revisão usam dados reais | router/arquitetura + RPC/RLS | probe autenticado |
| Agenda | consulta real; criação propõe e exige confirmação | router/contrato | Calendar conectado |
| Domínio | criar/editar/transicionar tarefa, nota e projeto pelo mesmo serviço | suíte + rollback SQL | painel |
| Arquivos/documentos | localização por metadado/OCR já processado; sem invenção | suíte | Drive/Document AI |
| Docs/Sheets | explícito, raiz JARVIS, project opcional, link, idempotência | guardrails/mocks | artefato controlado |
| Pesquisa | web search, fontes HTTPS, síntese e entregável | contrato | OpenAI + Google |
| Memória | só explícita, tipos permitidos, dedup, revisão e conflito newest-explicit-wins | contrato/RLS | probe |
| Atenção | saída canônica para Home/Jarvis; falhas acionáveis | fixtures | painel |
| WhatsApp | HMAC raw, timing-safe, replay, identidade verificada, pipeline e sender controlado | fixtures | bloqueado pela Meta |
| Segurança | RLS, ownership, projeto cruzado, secrets e idempotência | suíte + rollback SQL + Advisors | produção |
| PWA | manifest, standalone, shell-only cache, safe area e update | suíte | iPhone/Android |
| Backup | dump criptografado contém schema/dados | script | restore Docker isolado |
| Observabilidade | Calendar, Drive, OAuth, OpenAI, worker/OCR, WA e Supabase | guardrails | health check |

Nenhuma fixture deve persistir. SQL de aceite usa `ROLLBACK`; serviços externos usam mocks, salvo smoke tests controlados e explicitamente limpos quando seguro.

