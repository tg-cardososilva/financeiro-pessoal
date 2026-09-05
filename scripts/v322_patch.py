from pathlib import Path

APP = Path("app.js")
INDEX = Path("index.html")
README = Path("README.md")

text = APP.read_text(encoding="utf-8")
original = text


def remove_between(source: str, start_marker: str, end_marker: str) -> str:
    start = source.find(start_marker)
    if start < 0:
        raise SystemExit(f"start marker not found: {start_marker}")
    end = source.find(end_marker, start)
    if end < 0:
        raise SystemExit(f"end marker not found: {end_marker}")
    return source[:start] + source[end:]


# Remove temporary test-recognition constants/functions while preserving generic dedupe helpers.
text = remove_between(
    text,
    "const JARVIS_TEST_CLEANUP_KEY = 'jarvis_v32_test_cleanup_20260905'",
    "function jarvisActionFingerprint(a) {",
)

# Remove the automatic database cleanup routine entirely.
text = remove_between(
    text,
    "async function cleanupKnownJarvisTestData() {",
    "function monthRange() {",
)

replacements = {
    "state.jarvis.messages = (messages.data || []).filter((x) => !isJarvisTestMessage(x)).reverse()":
        "state.jarvis.messages = (messages.data || []).reverse()",
    "state.jarvis.annotations = dedupeJarvisAnnotations((annotations.data || []).filter((x) => !isJarvisTestAnnotation(x)))":
        "state.jarvis.annotations = dedupeJarvisAnnotations(annotations.data || [])",
    "state.jarvis.notes = (notes.data || []).filter((x) => !isJarvisTestNote(x))":
        "state.jarvis.notes = notes.data || []",
    "state.jarvis.tasks = (tasks.data || []).filter((x) => !isJarvisTestTask(x))":
        "state.jarvis.tasks = tasks.data || []",
    "state.jarvis.actions = dedupeJarvisActions((actions.data || []).filter((x) => !isJarvisTestAction(x)))":
        "state.jarvis.actions = dedupeJarvisActions(actions.data || [])",
    "    cleanupKnownJarvisTestData().catch((err) => console.warn('Jarvis test cleanup', err))\n": "",
}

for old, new in replacements.items():
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"expected exactly one match, found {count}: {old[:90]}")
    text = text.replace(old, new, 1)

for forbidden in (
    "JARVIS_TEST_CLEANUP_KEY",
    "JARVIS_TEST_WINDOW_START",
    "JARVIS_TEST_WINDOW_END",
    "isJarvisTest",
    "cleanupKnownJarvisTestData",
    "Reunião com Carlos",
    "Mandar o contrato para o contador",
    "gastei R$ 42,50 na Edna",
):
    if forbidden in text:
        raise SystemExit(f"temporary test logic still present: {forbidden}")

if "function dedupeJarvisActions" not in text or "function dedupeJarvisAnnotations" not in text:
    raise SystemExit("generic Jarvis dedupe helpers were accidentally removed")

load_start = text.find("async function loadJarvisData(force = false) {")
load_end = text.find("function jarvisIntentLabel(intent) {", load_start)
if load_start < 0 or load_end < 0:
    raise SystemExit("loadJarvisData boundaries not found")
load_block = text[load_start:load_end]
for write_token in (".delete()", ".insert(", ".update(", ".upsert(", ".rpc(", ".functions.invoke("):
    if write_token in load_block:
        raise SystemExit(f"loadJarvisData is not read-only: found {write_token}")

if text == original:
    raise SystemExit("app.js was not changed")
APP.write_text(text, encoding="utf-8")

index = INDEX.read_text(encoding="utf-8")
if index.count("v=3.2.1") != 2:
    raise SystemExit("unexpected index.html version markers")
index = index.replace("v=3.2.1", "v=3.2.2")
INDEX.write_text(index, encoding="utf-8")

readme = README.read_text(encoding="utf-8")
if "# Jarvis v3.2.1 - sidebar limpa" not in readme:
    raise SystemExit("unexpected README version heading")
readme = readme.replace(
    "# Jarvis v3.2.1 - sidebar limpa",
    "# Jarvis v3.2.2 - limpeza arquitetural",
    1,
)
readme += "\n## v3.2.2\n\n- Remove a rotina temporária que reconhecia, escondia e apagava dados de teste do Jarvis.\n- `loadJarvisData()` volta a ser somente leitura.\n- Mantém deduplicação genérica de ações e anotações para proteção visual.\n- Regra arquitetural: abrir ou atualizar uma tela nunca apaga dados automaticamente.\n"
README.write_text(readme, encoding="utf-8")

print("v3.2.2 patch applied successfully")
