# 07: Cliente da API e API falsa: arquivos do agente

**What to build:** O cliente da API ganha as funções dos arquivos de skill e de agente do Hermes, e a API falsa passa a responder a elas, inclusive com o acesso negado para quem não é o dono.

**Blocked by:** 03 (Cliente da API e API falsa: eventos e tags)

**Status:** ready-for-agent

**Leia antes:** o [README](README.md) desta pasta. Spec: “Artefatos” (último item) e ADR 0005.

- [ ] Há funções para: listar os arquivos, ler o texto de um arquivo, listar os backups, restaurar um backup e pedir uma edição ao Hermes.
- [ ] Na API falsa, o teste escolhe se o usuário é o dono; para quem não é, todas as rotas respondem sem permissão.
- [ ] Na API falsa, restaurar troca o texto do arquivo e guarda o texto substituído como um backup novo.
- [ ] A lista de backups traz só id, caminho, data e tamanho de cada um, sem o texto.
- [ ] O pedido de edição devolve o pedido inteiro, que se acompanha pelas funções de pedidos; com o Hermes desligado, devolve serviço desligado.
- [ ] Os corpos de entrada e as respostas que não têm esquema no pacote de contratos são conferidos por esquemas declarados na própria API falsa, com a mesma forma dos controllers da API (veja `api-rotas.md`, nas notas).
- [ ] Corpos e respostas são conferidos contra os esquemas do contrato, e os testes do cliente rodam contra a API falsa.
- [ ] Os testes novos passam, e `pnpm run test:unit` e `pnpm run typecheck` continuam verdes.
