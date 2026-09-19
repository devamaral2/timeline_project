# Bootstrap da VPS para desenvolvimento remoto

## Pré-requisitos

- Ubuntu suportado e usuário de desenvolvimento com sudo;
- acesso SSH já autorizado pelo operador;
- repositório e credenciais fornecidos pelo ambiente, não por argumentos do
  shell nem por arquivos commitados.

## Bootstrap

No host, como usuário de desenvolvimento:

```bash
IA_REPO_URL=https://github.com/devamaral2/timeline_project.git \
  scripts/ia/vps-bootstrap.sh
```

O script instala ferramentas básicas, Node 24/pnpm, clona ou atualiza o
repositório e valida a fonte `.ia/`. Ele não cria usuário root, não abre portas,
não copia segredos e não altera a stack de produção.

## Recuperação

- reexecutar o script é seguro após falha de rede;
- revisar `git status` antes de qualquer pull manual;
- remover somente o link do adaptador com `scripts/ia/adapter.sh remove`;
- não apagar volumes de produção para corrigir um staging quebrado.

O endurecimento SSH, firewall, proxy e secrets da VPS ainda requer execução
controlada no host alvo (RAF-113).
