# Jarvis v3.0.0 — Ambiente Pessoal 360º

Esta versão reposiciona o projeto: Finanças deixa de ser a home principal e passa a ser um módulo dentro do ambiente pessoal Jarvis.

## Nova arquitetura

- Início: resumo do dia, atenção do Jarvis, finanças, projetos, notas e integrações.
- Jarvis: conversa central, ações pendentes e integrações.
- Agenda: Google Calendar, eventos criados pelo Jarvis e confirmações pendentes.
- Tarefas: lembretes e captura rápida em linguagem natural.
- Notas & Ideias: memória estruturada e captura rápida.
- Projetos: projetos existentes e criação por conversa com o Jarvis.
- Finanças: preserva Visão geral, Transações, Compras, Investimentos, Contas e Importação.
- Roadmap visível: Drive, Maps/Places e Document AI.

## Filosofia de canal

O painel é a central visual. O WhatsApp será o canal móvel do mesmo Jarvis, usando o mesmo núcleo e os mesmos dados. A interface já sinaliza o WhatsApp como integração em configuração de produção.

## Instalação no GitHub Pages

Substitua os três arquivos na raiz do repositório:

- index.html
- app.js
- styles.css

Depois aguarde o GitHub Pages publicar e recarregue a página com cache limpo se necessário.

## Observação

Esta versão não remove nem migra os dados financeiros existentes. Ela reorganiza a experiência em volta do Jarvis e reaproveita as tabelas Jarvis já existentes no Supabase.
