# Login Social (Firebase) — Configuração

## Pré-requisitos

1. **Arquivo de credenciais**: Coloque `firebase-service-account.json` em `server/` ou defina `FIREBASE_SERVICE_ACCOUNT_PATH` no ambiente.
2. **Migrações**: As migrations 5 (firebase_uid) e 9 (avatar_url) devem estar aplicadas no banco.

## Erro 500 no login social

Se ocorrer 500 ao tentar login com Google/social:

- Verifique os **logs do servidor** — a mensagem completa e o stack trace são registrados.
- **Migrações**: Reinicie o servidor para garantir que as migrações rodem. Confirme que `schema_version` tem as versões aplicadas.
- **Firebase não configurado**: Sem credenciais, retorna **503** (não 500).

## Regra do projeto

Ver `.cursor/rules/firebase-login-social.mdc` para não regredir correções aplicadas.
