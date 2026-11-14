# Tickets: o web sobre a API do banco novo

Estes 51 tickets dividem a spec [docs/prd/web-no-banco-novo.md](../../../docs/prd/web-no-banco-novo.md). Cada
ticket cabe numa sessão: leia este arquivo, o ticket e o que ele manda ler, e nada mais é preciso.

## O que vale para todo ticket

- **Fonte.** A spec decide o comportamento. O glossário está em [CONTEXT.md](../../../CONTEXT.md): use os termos dele
  (evento, evento de referência, evento longo, executor, artefato, pedido, passo, sessão, entrada, subtarefa,
  bloqueio) no código, nos testes e nos textos. O desenho das telas está no canvas
  [Entidade única — agenda e tarefas](https://claude.ai/artifact/JyY9he8CQyMFdKfigLiwkR); cada ticket diz o quadro.
  As rotas da API estão no Swagger, em `/docs` da API.
- **Não mude a API, o banco nem os contratos compartilhados.** Se o ticket parecer exigir um dado que a API não
  entrega, pare e relate a lacuna, em vez de inventar o dado ou a regra. As lacunas já conhecidas estão na seção
  “Notas” da spec, e a tela não mostra esses itens.
- **Fora de escopo:** o app Android, o redesenho do chat, os modos configuráveis, o robô na barra inferior e a troca
  de “Hermes” por “Candeia” nos textos.
- **Testes.** Teste o que o usuário vê e faz e o que sai pela rede, não o estado interno. Há duas costuras: a tela
  montada sobre a API falsa em memória (ticket 03 em diante) e a política de rotas do gateway (ticket 01). A API
  falsa confere corpos e respostas contra os esquemas do contrato; não a contorne com respostas soltas.
- **Contrato antigo e novo convivem** até o ticket 51. Não apague um módulo antigo que outra tela ainda usa; o seu
  ticket troca só a tela dele.
- **Paridade.** Um ticket que muda uma tela atualiza a linha dela em `docs/mobile-parity.md`, com o Android marcado
  como em progresso. Não mexa em `apps/mobile`.
- **Comandos**, sempre da raiz do repositório: `pnpm run test:unit` e `pnpm run typecheck`. Os testes de contrato do
  mobile já estão quebrados nesta branch, por decisão; não os conserte.
- **Pronto** é: todos os critérios do ticket marcados e os dois comandos verdes.

## Ordem

Um ticket pode começar quando todos os que o bloqueiam estão feitos. Podem começar já: 01 e 02. Depois do 03, quatro
frentes andam em paralelo: linha e listas, detalhe, artefatos e pedidos.

| Ticket | Título | Bloqueado por |
|---|---|---|
| [01](01-gateway-artefatos-e-pedidos.md) | Gateway libera artefatos e pedidos | — |
| [02](02-web-usa-contratos-compartilhados.md) | Web usa os contratos compartilhados | — |
| [03](03-cliente-e-api-falsa-eventos.md) | Cliente da API e API falsa: eventos e tags | 02 |
| [04](04-cliente-e-api-falsa-artefatos.md) | Cliente da API e API falsa: artefatos | 03 |
| [05](05-cliente-e-api-falsa-series.md) | Cliente da API e API falsa: séries | 03 |
| [06](06-cliente-e-api-falsa-pedidos.md) | Cliente da API e API falsa: pedidos | 03 |
| [07](07-cliente-e-api-falsa-arquivos-do-agente.md) | Cliente da API e API falsa: arquivos do agente | 03 |
| [08](08-textos-calculados-da-linha.md) | Textos calculados da linha | 02 |
| [09](09-glifos-de-status-e-icones-de-tipo.md) | Glifos de status e ícones de tipo | 02 |
| [10](10-linha-unica-das-listas.md) | Linha única das listas | 08, 09 |
| [11](11-agenda-le-a-api-nova.md) | Agenda lê a API nova | 03, 10 |
| [12](12-agenda-tempo-livre-so-de-pessoa.md) | Agenda: tempo livre só de pessoa | 11 |
| [13](13-agenda-evento-de-referencia-ganha-status.md) | Agenda: evento de referência ganha status | 11 |
| [14](14-avisos-da-agenda-e-da-lista.md) | Avisos a partir da agenda e da lista de tarefas | 03 |
| [15](15-lista-de-tarefas-le-a-api-nova.md) | Lista de tarefas lê a API nova, em seis grupos | 03, 10 |
| [16](16-lista-serie-fracao-e-espera.md) | Lista de tarefas: série uma vez, fração e espera | 15 |
| [17](17-lista-concluir-e-reabrir.md) | Lista de tarefas: concluir e reabrir pelo glifo | 15 |
| [18](18-lista-filtros.md) | Lista de tarefas: filtros | 15 |
| [19](19-listas-se-recarregam.md) | Listas se recarregam com evento de agente em aberto | 11, 15 |
| [20](20-rota-unica-de-detalhe.md) | Rota única de detalhe do evento | 03, 09 |
| [21](21-detalhe-subtarefas-e-bloqueios.md) | Detalhe: subtarefas e bloqueios | 20, 10 |
| [22](22-detalhe-artefatos-do-evento.md) | Detalhe: artefatos do evento | 20 |
| [23](23-detalhe-apagar-evento.md) | Detalhe: apagar evento | 20 |
| [24](24-edicao-campos-basicos.md) | Edição: campos básicos, Descartar e Salvar | 20 |
| [25](25-edicao-lembretes-e-tags.md) | Edição: lembretes e tags | 24 |
| [26](26-edicao-tarefa-persistente.md) | Edição: tarefa persistente | 24 |
| [27](27-edicao-subtarefas.md) | Edição: subtarefas | 24, 21 |
| [28](28-edicao-bloqueios.md) | Edição: bloqueios | 24, 21 |
| [29](29-edicao-artefatos.md) | Edição: ligar, reordenar e remover artefatos | 24, 22, 04 |
| [30](30-edicao-alimento-e-exercicio.md) | Edição: alimento na refeição e exercício no treino | 29 |
| [31](31-edicao-recorrencia.md) | Edição: recorrência | 24, 05 |
| [32](32-criacao-de-evento.md) | Criação de evento pelo formulário | 24 |
| [33](33-aba-notas-lista-artefatos.md) | Aba Notas lista artefatos | 04 |
| [34](34-detalhe-do-artefato.md) | Detalhe do artefato | 33 |
| [35](35-nota-de-texto.md) | Nota de texto: criar, editar e apagar | 34 |
| [36](36-alimento-criar-e-acompanhar.md) | Alimento: criar e acompanhar o cálculo | 34 |
| [37](37-arquivo-do-agente-texto.md) | Arquivo do agente: texto atual | 34, 07 |
| [38](38-arquivo-do-agente-backups.md) | Arquivo do agente: backups e restauração | 37 |
| [39](39-arquivo-do-agente-pedido-de-edicao.md) | Arquivo do agente: pedido de edição | 37, 06 |
| [40](40-chat-por-passos.md) | Chat por passos sobre pedidos | 06 |
| [41](41-chat-com-o-hermes.md) | Chat com o Hermes sobre pedidos | 40 |
| [42](42-chat-recupera-pedidos-em-aberto.md) | Chat recupera pedidos em aberto | 40 |
| [43](43-barra-de-edicao-com-ia.md) | Barra de edição com IA no evento e no artefato | 06, 20, 34 |
| [44](44-voz-vira-pedido.md) | Voz vira pedido | 06 |
| [45](45-detalhe-do-agente-base.md) | Detalhe do evento de agente: Informações, Passos e Registro | 20, 06 |
| [46](46-detalhe-do-agente-entradas.md) | Detalhe do evento de agente: Entradas, Produziu e Sessão | 45 |
| [47](47-detalhe-do-agente-acoes.md) | Detalhe do evento de agente: cancelar, falha e continuar | 45 |
| [48](48-modo-de-visualizacao.md) | Modo de visualização filtra as duas listas | 11, 15 |
| [49](49-menu-de-modos.md) | Menu de modos na aba selecionada | 48 |
| [50](50-teste-de-cobertura-de-rotas.md) | Teste de cobertura de rotas | 03, 04, 05, 06, 07 |
| [51](51-remocao-do-contrato-antigo.md) | Remoção do contrato antigo | 11–49 |
