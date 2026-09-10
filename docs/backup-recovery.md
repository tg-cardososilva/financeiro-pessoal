# Backup lógico e recuperação

## Arquitetura aprovada para o Jarvis 1.0

O gate oficial roda remotamente no GitHub Actions. O Mac pessoal nao faz parte da cadeia de backup.

`Supabase producao (somente leitura) -> pg_dump 17 -> age -> artefato criptografado -> PostgreSQL 17 efemero -> validacao -> descarte automatico`

O workflow `.github/workflows/jarvis-backup-restore.yml` so aceita disparo manual, tem permissao `contents: read`, usa o ambiente protegido `jarvis-production-backup` e publica somente `.tar.age` e o checksum. O dump em claro, a identidade privada e o banco restaurado existem apenas no runner efemero durante o job.

## Política

- RPO recomendado: 24 horas. Execute o backup diariamente e também antes de migrations relevantes.
- RTO objetivo: 4 horas para restaurar banco, secrets, funções e frontend em novo ambiente.
- Retenção inicial de aceite: 7 dias no GitHub Actions. Uma rotina periódica e uma retenção de longo prazo só devem ser ativadas depois que a execução manual passar.
- Armazenamento: mantenha o arquivo `.age` e seu checksum fora do Supabase, em armazenamento privado com versionamento/MFA. Guarde a identidade privada `age` separada do backup.
- O dump lógico contém schema e dados. Tokens presentes nas tabelas protegidas tornam criptografia e controle de acesso obrigatórios.
- O dump lógico inclui `public`, `auth`, `storage` (metadados) e `supabase_migrations`. Os bytes dos objetos do Supabase Storage não vivem dentro do PostgreSQL e não são copiados pelo `pg_dump`.

## Secrets do ambiente GitHub

Crie o ambiente `jarvis-production-backup` e cadastre nele somente:

- `SUPABASE_DB_URL`: URI do **Session pooler**, porta 5432, com a senha do banco codificada para URL quando necessário. O workflow força todas as operações na origem para `default_transaction_read_only=on`.
- `BACKUP_AGE_IDENTITY`: conteúdo completo da identidade privada gerada por `age-keygen`. A chave pública é derivada no runner; `BACKUP_AGE_RECIPIENT` não é mais necessário.

O workflow falha fechado quando algum secret falta, quando a origem/destino não é PostgreSQL 17 ou quando o destino aponta para `supabase.co`/o project ref de produção.

## Executar o aceite manual

1. Abra **Actions > Jarvis encrypted backup and restore test > Run workflow**.
2. Escolha a branch `main`, digite `BACKUP` e execute.
3. Confirme que o job terminou verde e que a etapa de restore registrou apenas `RESTORE_OK`.
4. Baixe o artefato criptografado e seu checksum enquanto estiverem dentro da retenção de 7 dias.

O teste confere: versão PostgreSQL 17; presença de schema e dados; integridade SHA-256; descriptografia; restauração; RLS/FKs; e igualdade de contagens de tabelas críticas. As contagens ficam dentro do pacote criptografado e não são impressas nos logs.

## Execução avulsa em outro runner Linux

```bash
export SUPABASE_DB_URL='postgresql://...'
export BACKUP_AGE_IDENTITY='/caminho/separado/identity.txt'
export JARVIS_BACKUP_DIR='/caminho/seguro/jarvis'
bash scripts/backup-logical.sh
```

O script usa `pg_dump` 17 custom, confirma os schemas e dados críticos, empacota o manifesto e criptografa antes de produzir o artefato final. Nenhum dump em claro permanece após a execução.

## Testar restauração sem tocar produção

```bash
export JARVIS_BACKUP_FILE='/caminho/seguro/jarvis-AAAAMMDDTHHMMSSZ.tar.age'
export BACKUP_AGE_IDENTITY='/caminho/separado/identity.txt'
export JARVIS_RESTORE_DB_URL='postgresql://...banco-postgresql-17-descartavel...'
bash scripts/restore-test.sh
```

O script exige um PostgreSQL 17 vazio e descartável, recusa qualquer destino Supabase/produção, restaura o dump e valida tabelas canônicas, RLS, FKs e contagens. No workflow oficial, o serviço PostgreSQL é destruído automaticamente pelo GitHub Actions no fim do job.

## Recuperação real

1. Declare incidente e congele escritas no frontend.
2. Crie um projeto Supabase vazio na mesma região aprovada.
3. Restaure primeiro em ambiente isolado e valide contagens, constraints e RLS.
4. Cadastre secrets por canal seguro usando `.env.example` como inventário.
5. Publique Edge Functions conforme `supabase/config.toml`.
6. Reconfigure callbacks Google/Meta para o novo projeto.
7. Faça smoke tests com usuário autorizado antes de trocar DNS/links.
8. Preserve o backup original e o log do restore para auditoria.
