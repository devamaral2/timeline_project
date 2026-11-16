# 10: Código interno do web com nome de tarefa

**What to build:** Quem lê o web encontra tarefa em todo lugar. Os módulos de tela (detalhe, linha, glifos, marca de tipo e de prioridade, seletor de status, diálogo de exclusão, botão de voz, formulários de criação, tira da semana), os hooks e os utilitários passam a ter nome de tarefa, e o módulo da tela Tarefas ganha um nome que não colide (como "lista de tarefas"). Nada muda para quem usa: textos e endereços mudam no ticket 11.

**Blocked by:** 06 (Contrato de tarefa)

**Status:** done

**Leia antes:** o [README](README.md). Spec: "Web" (módulos de tela e troca por símbolo).

- [ ] Nenhuma pasta, arquivo, componente, hook, classe CSS de módulo, tipo ou variável de domínio do web tem "event" no nome, fora das exceções da varredura.
- [x] Os eventos de DOM, os parâmetros `event` dos handlers e o `text/event-stream` ficam intactos.
- [x] O módulo da tela Tarefas e o módulo de tarefa não colidem de nome.
- [x] Os testes de tela conferem o mesmo que antes e passam.
- [ ] `pnpm run test:unit` e `pnpm run typecheck` verdes; a área "web, código" sai da linha de base.

**Pendências (feitas como parte dos tickets 07 e 11, que mexem nos mesmos arquivos):** a área "web, código" não esvazia
sozinha. Ficam, por pertencerem ao cliente HTTP, à API falsa e às rotas de página: `getEvent`, `updateEvent`,
`deleteEvent`, `createEvent`, `listTrackedEvents`, `EditEventInput`, `eventFixture`, `eventsArea`, a chave `events` das
sementes e das tabelas da API falsa, o campo `eventId` dos vínculos de artefato e o parâmetro `eventId` das páginas
`[eventId]`. Quem renomear esses nomes retira as linhas restantes com `pnpm run residuos:encolher`.
