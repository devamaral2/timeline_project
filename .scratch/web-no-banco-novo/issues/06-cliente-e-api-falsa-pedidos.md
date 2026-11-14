# 06: Cliente da API e API falsa: pedidos

**What to build:** O cliente da API ganha as funções de pedidos ao agente, e a API falsa passa a simular um pedido que avança de estado entre duas leituras.

**Blocked by:** 03 (Cliente da API e API falsa: eventos e tags)

**Status:** ready-for-agent

**Leia antes:** o [README](README.md) desta pasta. Spec: “Cliente da API”, “Pedidos: chat, barra de edição e voz”. Glossário: Pedido, Passo, Sessão.

- [ ] Há funções para: abrir pedido em texto, pedido de edição da entidade aberta, mensagem ao Hermes e pedido de voz; acompanhar um pedido; listar os pedidos; cancelar.
- [ ] A mensagem ao Hermes devolve o pedido inteiro, e não só o id; os outros três devolvem o id do pedido.
- [ ] O teste controla o avanço do pedido na API falsa: na fila, executando, feito ou falhou, com passos, entidades e resposta.
- [ ] Na API falsa, reenviar o mesmo id de mensagem do cliente devolve o pedido já aceito, sem abrir outro.
- [ ] Na API falsa, um `sessionId` que não é pedido do usuário responde não encontrado.
- [ ] Com o Hermes desligado, a rota dele responde não encontrado antes de ler o corpo, e o cliente devolve um erro próprio de serviço desligado.
- [ ] Cancelar devolve o pedido cancelado ou no estado final em que estava; cancelar um pedido que calcula um alimento devolve o conflito próprio desse caso.
- [ ] Os corpos de entrada e as respostas que não têm esquema no pacote de contratos são conferidos por esquemas declarados na própria API falsa, com a mesma forma dos controllers da API (veja `api-rotas.md`, nas notas).
- [ ] Corpos e respostas são conferidos contra os esquemas do contrato, e os testes do cliente rodam contra a API falsa.
- [ ] Os testes novos passam, e `pnpm run test:unit` e `pnpm run typecheck` continuam verdes.
