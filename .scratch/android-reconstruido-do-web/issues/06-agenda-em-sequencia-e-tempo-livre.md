# 06: Agenda em sequência e tempo livre

**What to build:** Pela engrenagem do menu da Agenda, o usuário troca entre "Por dia" e "Em sequência", que rola pelo tempo carregando 7 dias por vez para frente e para trás, e liga "Tempo livre", que mostra os intervalos de 15 minutos ou mais entre as tarefas de pessoa.

**Blocked by:** 05

**Status:** ready-for-agent

**Leia antes:** o [README](README.md). No web: a engrenagem da Agenda, o modo em sequência e o cálculo de tempo livre.

- [ ] A engrenagem da Agenda tem o segmento "Por dia" / "Em sequência" e o interruptor "Tempo livre", guardados como no web.
- [ ] "Em sequência" carrega de 7 em 7 dias, até 364 dias em cada sentido, sem duplicar tarefas nas bordas.
- [ ] O tempo livre segue a regra do web (só tarefas de pessoa, intervalos de 15 min ou mais), portada e conferida contra fixtures do TS.
- [ ] O intervalo livre é um alvo tocável, que o ticket 12 liga ao chat.
