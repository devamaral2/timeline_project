# Hooks

Hooks versionados descrevem eventos e contratos, não o caminho do binário nem o
diretório de dados do ambiente. O wrapper deve receber essas dependências por
variáveis de ambiente e falhar sem bloquear o desenvolvimento quando o serviço
de memória estiver indisponível.

O inventário atual está em
[`docs/ia-infrastructure/inventory.md`](../../docs/ia-infrastructure/inventory.md).
A migração dos hooks ai-memory fica na RAF-119.
