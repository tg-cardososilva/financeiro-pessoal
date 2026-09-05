# Jarvis v3.2.2 - limpeza arquitetural

Arquivos para subir diretamente na raiz do repositorio GitHub Pages:

- `index.html`
- `app.js`
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
