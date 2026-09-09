# Backup lógico e recuperação

## Política

- RPO recomendado: 24 horas. Execute o backup diariamente e também antes de migrations relevantes.
- RTO objetivo: 4 horas para restaurar banco, secrets, funções e frontend em novo ambiente.
- Retenção: 7 diários, 4 semanais e 12 mensais, ajustável ao espaço disponível.
- Armazenamento: mantenha o arquivo `.age` e seu checksum fora do Supabase, em armazenamento privado com versionamento/MFA. Guarde a identidade privada `age` separada do backup.
- O dump lógico contém schema e dados. Tokens presentes nas tabelas protegidas tornam criptografia e controle de acesso obrigatórios.

## Gerar

```bash
export SUPABASE_DB_URL='postgresql://...'
export BACKUP_AGE_RECIPIENT='age1...'
export JARVIS_BACKUP_DIR='/caminho/seguro/jarvis'
bash scripts/backup-logical.sh
```

O script usa `pg_dump` custom, confirma que schema e `TABLE DATA` existem, criptografa antes de produzir o artefato final e grava SHA-256. Nenhum dump em claro permanece após a execução.

## Testar restauração sem tocar produção

```bash
export JARVIS_BACKUP_FILE='/caminho/seguro/jarvis-AAAAMMDDTHHMMSSZ.dump.age'
export BACKUP_AGE_IDENTITY='/caminho/separado/identity.txt'
bash scripts/restore-test.sh
```

O script cria um PostgreSQL 17 efêmero em Docker, restaura o dump, valida tabelas canônicas e RLS e remove somente esse container temporário. Nunca recebe URL de produção e nunca sobrescreve o banco real.

## Recuperação real

1. Declare incidente e congele escritas no frontend.
2. Crie um projeto Supabase vazio na mesma região aprovada.
3. Restaure primeiro em ambiente isolado e valide contagens, constraints e RLS.
4. Cadastre secrets por canal seguro usando `.env.example` como inventário.
5. Publique Edge Functions conforme `supabase/config.toml`.
6. Reconfigure callbacks Google/Meta para o novo projeto.
7. Faça smoke tests com usuário autorizado antes de trocar DNS/links.
8. Preserve o backup original e o log do restore para auditoria.

