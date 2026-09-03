# ADR-103 — `local-path` mais backup lógico como estratégia de armazenamento

**Status:** aceita · **Data:** 2026-08-31

## Contexto

Com PostgreSQL e Redis migrando para o cluster ([Fase 4](../06-fase-4-dados-no-cluster.md)),
é preciso decidir como o disco chega até eles. O cluster tem **um nó**, e a
[ADR-006 do v1](../../docs/adr/006-banco-em-container.md) já havia decidido que o banco
roda em container no mesmo servidor.

## Decisão

Usar o `local-path-provisioner` que vem com o k3s, com `volumeClaimTemplates` nos
StatefulSets. A recuperação de desastre continua sendo o **backup lógico** — `pg_dump` e
snapshot do Redis, enviados para fora por `rclone`, com restore testado.

## Alternativas consideradas

**Longhorn ou outro storage distribuído.** Dá réplica, snapshot e volume que segue o pod.
É a resposta certa a partir de três nós. Com um nó, ele replica o volume nele mesmo:
consome RAM e CPU para dar uma garantia que não existe.

**hostPath direto, sem provisionador.** Uma peça a menos. Descartado por perder o ciclo de
vida do PVC: o volume deixaria de nascer e morrer com a identidade do StatefulSet, e
volumes órfãos passariam a se acumular sem ninguém saber para quê.

**Volume em bloco do provedor.** Se a HostGator oferecer disco anexável, ele sobrevive à
morte da instância — o que é uma garantia real. Descartado por não estar disponível no
plano atual; vale reconsiderar se estiver.

**Snapshot de PV por CSI.** Exige um driver CSI que suporte snapshot, que o `local-path`
não é. Ficaria disponível junto com qualquer das opções acima.

## Consequências

**Positivas.** Zero configuração e zero consumo extra. O desempenho é o do disco local,
sem camada de rede — o melhor caso possível para um banco.

**Negativas.** O volume está preso ao nó. Não há réplica, não há snapshot e perder o disco
é perder o PV. Um `kubectl delete pvc` apaga o dado sem lixeira e sem desfazer.

**Mitigações.** O backup lógico externo é a única recuperação de desastre, e por isso a
Fase 4 exige restore testado duas vezes e a Fase 11 exige um terceiro. A regra de ouro
nº 4 do v2 existe por causa disso.

## Quando revisitar

- Ao passar de um nó — aí `local-path` deixa de fazer sentido imediatamente.
- Se o provedor passar a oferecer disco anexável.
- Se point-in-time recovery virar requisito, o que puxa junto a decisão sobre operador de
  PostgreSQL.
