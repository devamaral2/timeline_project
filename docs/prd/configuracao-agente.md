---
status: draft
date: 2026-11-08
---

# PRD: Configuração editável do agente

## Problema
Hoje, para ajustar como os agentes da agenda decidem e agem, o dono precisa mexer em arquivos do repositório, abrir PR e esperar deploy. Quando algo sai errado num pedido real, a correção leva o mesmo caminho. Os agentes do Hermes têm o mesmo problema: as skills criadas ou alteradas lá não aparecem na aplicação e não têm histórico.

## Usuários e cenários
Usuário: o dono da aplicação (único usuário por enquanto).
- **Ajuste de comportamento**: o dono percebe que o agente de roteamento manda um pedido de consulta para criação. Edita o texto do agente, publica e o próximo pedido já segue a nova regra.
- **Desfazer**: uma publicação piorou o comportamento. O dono volta ao instantâneo anterior pela aplicação.
- **Skill do Hermes**: o dono edita, na aplicação, uma skill que o Hermes usa. Se o Hermes estiver fora do ar, a publicação vale e a sincronização aparece como pendente até chegar.

## Requisitos
R1. A configuração de roteamento, entidade e consulta é editada agente por agente, na aplicação.
R2. Os parâmetros editáveis são passos, custo, timeouts e limiar de certeza do roteador. O modelo de cada rota não é editável.
R3. Publicar uma edição a torna a versão ativa no momento em que é salva, sem reiniciar o serviço.
R4. Cada publicação grava um instantâneo do conjunto inteiro, e nenhum é apagado.
R5. A reversão devolve o conjunto inteiro a um instantâneo anterior, e o histórico continua disponível depois dela.
R6. O dono pode rodar frases de exemplo antes de publicar; a publicação não exige esse teste.
R7. Cada publicação sincroniza as skills e agentes com o Hermes na mesma ação.
R8. Antes de sincronizar, a aplicação lê o que está no Hermes. Uma alteração feita pelo Hermes aparece no histórico com origem Hermes e não é sobrescrita em silêncio.
R9. Se o Hermes estiver fora do ar, a publicação vale e a sincronização fica como pendência visível, repetida a cada 5 minutos.
R10. A importação inicial traz para a aplicação todas as skills e agentes que já existem no Hermes.
R11. Só o dono pode editar, publicar, reverter ou sincronizar.
R12. A configuração inicial vem do repositório como padrão de fábrica, e o dono pode voltar a ele.

## Fora de escopo
- Edição do modelo de cada rota.
- Papel de editor para outros usuários.
- Teste de frases obrigatório.
- Edição de modelos e chaves de API pela aplicação.

## Métricas de sucesso
- Uma mudança de texto chega a um pedido real sem deploy, no mesmo minuto em que é publicada. Fonte: teste manual antes e depois.
- Nenhuma alteração do Hermes é perdida após uma sincronização. Fonte: histórico com origem Hermes.
- Toda pendência de sincronização é resolvida ao voltar o Hermes. Fonte: lista de pendências na aplicação.

Os números de prazo e volume ainda não foram definidos.

## Questões em aberto
- Caminho exato das skills no volume do Hermes e comando de recarga da versão instalada (a verificar).
- Como a aplicação acessa o volume do Hermes em produção e em local (ver TDD).
- Qual é a validação mínima obrigatória na publicação, além do que o teste opcional cobre.
- Quais parâmetros do agente entram além de limites e timeouts.
- Prazo de entrega e quem usa primeiro: o dono, em local, ou a produção.
