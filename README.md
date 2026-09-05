# Jarvis v3.2.0 — Home viva

Arquivos para subir **diretamente na raiz** do repositório GitHub Pages:

- `index.html`
- `app.js`
- `styles.css`
- `jarvis-avatar.png`

Não crie pasta `assets`.

## Principais correções

- Saudação usa **Thiago** no perfil atual, sem exibir o e-mail.
- Home 360º usa dados reais já disponíveis de tarefas, ações, notas, projetos, finanças e integrações.
- Compromissos pendentes não aparecem como se já estivessem no calendário.
- Ações de calendário semanticamente duplicadas são consolidadas no painel.
- Contagem de projetos ativos não fica limitada aos três cards de prévia.
- Dados conhecidos dos testes de 05/09/2026 são ocultados imediatamente e a versão tenta removê-los do Supabase uma vez, usando a sessão autenticada e filtros exatos.
- Avatar do Jarvis é carregado da raiz (`./jarvis-avatar.png`) para combinar com o fluxo manual de upload no GitHub.

Após publicar, faça `Command + Shift + R`.
