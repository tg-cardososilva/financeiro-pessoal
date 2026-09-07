from pathlib import Path
p=Path('app.js')
s=p.read_text()
replacements={
"bind('taskFilterQ', 'q', 'input')":"bind('taskFilterQ', 'q')",
"bind('noteFilterQ','q','input')":"bind('noteFilterQ','q')",
"bind('projectFilterQ','q','input')":"bind('projectFilterQ','q')",
}
for old,new in replacements.items():
    if s.count(old)!=1:
        raise SystemExit(f'expected exactly one {old!r}, got {s.count(old)}')
    s=s.replace(old,new,1)
p.write_text(s)
print('search interaction hotfix applied')
