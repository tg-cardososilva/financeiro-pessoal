from pathlib import Path

index = Path('index.html')
text = index.read_text()
for old, new in [
    ('./styles.css?v=3.3.1', './styles.css?v=3.4.0b'),
    ('./app.js?v=3.3.1', './app.js?v=3.4.0b'),
]:
    if text.count(old) != 1:
        raise SystemExit(f'expected one cache-bust anchor: {old}')
    text = text.replace(old, new, 1)
index.write_text(text)

readme = Path('README.md')
r = readme.read_text()
old_heading = '# Jarvis v3.3.1 - Requer atencao com dados reais'
if old_heading not in r:
    raise SystemExit('README heading anchor missing')
r = r.replace(old_heading, '# Jarvis v3.4.0b - Tarefas, Notas e Projetos operacionais', 1)
if '- `domain-ui.js`' not in r:
    r = r.replace('- `attention-rules.js`\n', '- `attention-rules.js`\n- `domain-ui.js`\n- `jarvis-domain-client.js`\n', 1)
section = '''

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
'''
if '## v3.4.0b' not in r:
    r = r.rstrip() + section + '\n'
readme.write_text(r)
print('v3.4.0b final files prepared')
