# Arquitetura da infraestrutura compartilhada de IA

> Decisão da RAF-110. A pasta `.ia/` será criada e populada na RAF-112; este
> documento define seus limites antes da migração.

## Objetivo

Manter uma única fonte versionada para os artefatos que ensinam e conectam os
agentes ao repositório, permitindo que Codex, outros agentes e a VPS usem a
mesma definição sem copiar credenciais ou estado local.

## Regra de propriedade

| Camada | Fonte de verdade | Pode entrar no Git? | Exemplos |
| --- | --- | --- | --- |
| Contrato compartilhado | `.ia/` no repositório | Sim | skills, templates, hooks, manifestos MCP, scripts e documentação |
| Adaptador de ambiente | `.claude/`, `.agents/`, scripts de instalação ou configuração da VPS | Sim, quando reproduzível | symlinks, wrappers, caminhos, permissões e nomes esperados por cada agente |
| Estado local | diretórios do usuário ou volume da máquina | Não | caches, sessões, worktrees ativas, logs, perfis do navegador e artefatos de execução |
| Segredo | gerenciador de segredos/ambiente da máquina | Não | tokens, cookies, chaves SSH, senhas, `DATABASE_URL` e credenciais de plugins |

O contrato compartilhado não deve apontar para caminhos absolutos da máquina do
desenvolvedor. Caminhos chegam por variáveis de ambiente ou pelo adaptador.

## Estrutura-alvo

```text
.ia/
├── README.md                  # contrato, bootstrap e limites
├── manifest.yaml              # versão e componentes instaláveis
├── skills/                    # skills próprias do projeto
├── hooks/                     # hooks portáveis e seus contratos
├── mcp/
│   ├── README.md              # configuração sem credenciais
│   └── examples/              # exemplos sanitizados por ambiente
├── plugins/                   # manifestos e permissões esperadas
├── worktrees/                 # convenções e wrappers; não contém worktrees
├── scripts/                   # instalação, validação e diagnóstico
└── docs/                      # decisões e runbooks específicos da camada de IA
```

`docs/ia-infrastructure/` permanece como documentação de decisão do repositório;
a implementação operacional e os manifestos compartilhados vivem em `.ia/`.

## Contratos e precedência

1. O repositório define o contrato em `.ia/`.
2. O adaptador do agente expõe esse contrato no formato esperado pelo agente.
3. A configuração local pode sobrescrever apenas valores de ambiente, caminhos
   e permissões; não pode substituir silenciosamente skills ou hooks do contrato.
4. Segredos e estado nunca são resolvidos a partir de arquivos versionados.
5. Uma instalação deve ser idempotente e oferecer `check` e `remove` antes de
   qualquer migração definitiva.

Conflito entre uma definição local e a canônica é erro explícito, não uma
vitória da configuração mais recente.

## Componentes que não serão unificados

- tokens, cookies, perfis de navegador e sessões de login;
- chaves SSH, arquivos `.env*`, bases de dados e volumes;
- caches, logs e artefatos de execução do Playwright;
- estado de worktrees e portas atribuídas dinamicamente;
- configuração interna do produto Codex ou de outro agente que não tenha um
  formato público estável.

Esses itens podem ter um contrato de provisionamento ou um exemplo sanitizado,
mas continuam pertencendo ao ambiente que os executa.

## Segurança e ciclo de vida

- O `.gitignore` deve cobrir estado, credenciais e artefatos antes de qualquer
  script de bootstrap ser criado.
- Exemplos usam placeholders; valores reais são injetados no último momento.
- Hooks devem falhar de modo não destrutivo quando o serviço de memória estiver
  indisponível.
- O bootstrap da VPS será separado do contrato do repositório e executará com
  usuário sem privilégios por padrão.
- Toda instalação precisa registrar versão, origem e modo de rollback sem
  registrar o conteúdo de segredos.

## Fora do escopo desta decisão

Esta decisão não cria a pasta `.ia`, não instala nada na VPS e não escolhe um
gerenciador de segredos. Essas ações dependem do inventário da RAF-111 e serão
implementadas nas issues subsequentes.
