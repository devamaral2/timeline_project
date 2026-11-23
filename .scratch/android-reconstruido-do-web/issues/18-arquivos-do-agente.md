# 18: Arquivos do agente

**What to build:** O dono abre um documento de skill ou de agente e vê o caminho, o hash da versão e o aviso de "ausente da pasta", alterna entre markdown e texto cru, vê os backups e restaura um deles com confirmação, e pede ao agente que edite o arquivo, acompanhando o pedido. Para quem não é dono, a seção não aparece.

**Blocked by:** 11

**Status:** done

**Leia antes:** o [README](README.md). ADR [0005](../../../docs/adr/0005-skills-e-agentes-do-hermes-como-arquivos.md). No web: a vista do arquivo do agente.

- [x] A seção lê `GET /api/ai/config/file` e `GET /api/ai/config/backups` (o web não chama `GET /api/ai/config`, e o app também não: vale o web).
- [x] Um 403 esconde a seção sem erro na tela; um 404 de automação desligada mostra a mensagem do web.
- [x] Restaurar pede confirmação e manda `POST /api/ai/config/restore`; a restauração aparece nos backups e pode ser desfeita.
- [x] O pedido de edição manda `POST /api/ai/config/edit-request` e acompanha até terminar, relendo o arquivo.
