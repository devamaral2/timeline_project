---
status: superseded by 0005
date: 2026-11-08
---

# Publicação sem reinício, com instantâneo do conjunto inteiro e reversão

## Contexto

Com a configuração no banco (ADR 0001), uma edição precisa valer sem reiniciar o serviço. Os textos se referem uns aos outros por nome: o roteador aponta para skills, e uma skill nova exige seu critério no roteador. Desfazer só uma peça pode deixar o conjunto incoerente.

## Decisão

- **Publicação** torna a edição a versão ativa no momento em que é salva, sem reiniciar. A troca é atômica: nenhum pedido pega uma versão pela metade.
- Cada publicação grava um **instantâneo do conjunto inteiro**, sem limite de quantidade.
- **Reversão** devolve o conjunto inteiro a uma versão anterior, e não um item isolado.
- Antes de publicar, o dono pode rodar frases de exemplo, mas o teste é **opcional**. Sem teste obrigatório, o risco de um prompt ruim atingir um pedido real é aceito; a reversão limita o tempo do dano.

## Consequências

- O histórico cresce sem limite; como são textos, o custo é pequeno.
- Uma reversão também precisa sincronizar o Hermes (ver ADR 0003).
