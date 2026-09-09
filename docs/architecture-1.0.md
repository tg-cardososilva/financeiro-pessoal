# Arquitetura consolidada — Jarvis 1.0 RC

## Fontes de verdade

| Responsabilidade | Fonte canônica | Papel |
|---|---|---|
| Inteligência e orquestração | `jarvis-core` + OpenAI | Roteia deterministicamente, recupera apenas os domínios necessários e sintetiza sem inventar dados. |
| Memória e estado | Supabase/Postgres | Usuários, tarefas, notas, projetos, mensagens, memórias, ações, saúde e metadados. RLS mantém ownership. |
| Dados financeiros | Supabase/Postgres | Contas, transações, categorias, saldos, investimentos e conciliação. |
| Agenda real | Google Calendar | Leitura real; escrita somente após proposta e confirmação. |
| Arquivos reais | Google Drive, árvore `Meu Drive/JARVIS` | Binários e Docs/Sheets. `jarvis_files` guarda índice/metadados/contexto, não uma cópia. |
| OCR | Google Document AI via Cloud Run | Extrai texto sob pedido explícito. |
| Interpretação e pesquisa | OpenAI Responses API | Resposta fundamentada, extração de ação e pesquisa com fontes; `store:false`. |
| Canal móvel | Meta/WhatsApp | Webhook autenticado, identidade verificada e sender controlado. Liberação live ainda depende da Meta. |
| Painel/PWA | Mesmo frontend GitHub Pages | Central visual e canal web instalável, sem segunda aplicação ou banco. |

## Fluxo do cérebro

1. O roteador local classifica consulta, pesquisa ou escrita explícita.
2. Consultas chamam somente os adaptadores dos domínios classificados.
3. O contexto retornado é limitado e enviado ao modelo com regra de não inferir lacunas.
4. Escritas de Tarefas, Notas e Projetos passam por `domain-service.ts`, igual ao painel.
5. Ações externas sensíveis viram `jarvis_actions` propostas. O executor só roda após confirmação.
6. Docs/Sheets usam reserva atômica com idempotency key, ficam na raiz JARVIS, são indexados em `jarvis_files` e nunca sobrescritos.

## Acoplamentos controlados

- `jarvis-core` depende dos contratos das tabelas e dos adaptadores Google/OpenAI; esses limites ficam em `_shared`.
- Calendar e Drive compartilham armazenamento OAuth, porém mantêm providers e escopos separados.
- `jarvis_files` aponta para o Drive; indisponibilidade do Drive preserva o índice local, mas impede confirmar conteúdo remoto.
- Document AI depende do worker Cloud Run e de OpenAI para interpretação. Cada falha é registrada separadamente.
- O frontend continua grande; foram extraídos serviços de alto valor no backend. Uma reescrita de `app.js` foi deliberadamente evitada no RC.

