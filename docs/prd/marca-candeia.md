---
status: draft
date: 2026-11-10
---

# PRD: Marca Candeia

## Problema

Quem usa o produto encontra três nomes e nenhuma marca. O design system chama o produto de Braid, o app mostra a
assinatura "Agente pessoal" e o chat chama o agente de Hermes, que é o nome de um agente de terceiros. O símbolo
desenhado, a trança, some em tamanhos pequenos, então o app está no ar sem símbolo, e o sinal do agente no chat não
tem relação com a marca. O dono criou muitos logos e não ficou satisfeito com nenhum.

## Usuários e cenários

Usuários: o dono e as pessoas que entram por convite.

- **Abrir o app**: a pessoa vê a assinatura `candeia` e o símbolo da lamparina, no web e no Android, e reconhece o
  mesmo produto nos dois.
- **Falar com o agente**: no chat e nas ações de edição, a pessoa pede ao Candeia. O sinal que escuta, pensa e conclui
  é o mesmo desenho do ícone do app.
- **Achar o app no celular**: o ícone na tela inicial e o favicon no navegador são a lamparina, reconhecível em
  tamanho pequeno e sem a palavra ao lado.

## Requisitos

R1. O nome exibido do produto é Candeia em todos os pontos visíveis: assinatura, títulos de página, nome do app no Android e título da documentação das APIs.
R2. A assinatura é a palavra `candeia` em minúsculas, na serifa atual, sem linha de apoio. Ela substitui "Agente pessoal".
R3. O agente é chamado de Candeia, no masculino, em todos os textos: "Planejar com o Candeia", "Pedido ao Candeia", "Passos do Candeia".
R4. Nenhum texto visível ao usuário diz Braid, Hermes, Agente pessoal ou Assistente para se referir ao produto ou ao agente.
R5. O símbolo é a lamparina: uma candeia de bico, com corpo em tinta e chama em verde-água na ponta do bico, voltada para a frente.
R6. O símbolo é feito de duas peças cheias, sem linhas internas, sem tampa e sem alça enrolada.
R7. O símbolo é reconhecível em 16 px e mantém a mesma silhueta quando desenhado em uma cor só.
R8. O mesmo desenho é o ícone do app, o favicon e o sinal do agente. A trança e a onda de cinco barras deixam de aparecer.
R9. No sinal do agente, a chama é a única parte que se move para mostrar o estado.
R10. Os temas Névoa e Noite, a tipografia e a regra de um único ponto verde-água por tela permanecem como estão.
R11. O produto declara que o nome é uma homenagem ao sambista Candeia.
R12. O agente não tem persona: não fala como o artista nem imita o jeito dele.
R13. A troca chega como atualização do app já instalado; ninguém precisa instalar um app novo.
R14. Tudo o que muda no web muda também no Android, na mesma entrega.

## Fora de escopo

- Trocar identificadores técnicos (`braid`, `hermes`) em código, pacotes, imagens ou infraestrutura.
- Mudar paleta, tipografia ou temas.
- Criar uma linha de apoio para o nome.
- Dar ao agente um tom ou uma personalidade inspirados no artista.
- Usar retrato, voz ou música do artista. O dono pretende usar um retrato e deixou a decisão para depois.
- Comprar domínio.

## Métricas de sucesso

- Nenhuma ocorrência de Braid, Hermes, Agente pessoal ou Assistente nos textos visíveis do web e do Android, conferida por busca nos textos da interface e pela tabela de paridade em `docs/mobile-parity.md`.
- O símbolo é reconhecido como uma lamparina em 16 px, nos temas Névoa e Noite, pelo dono e por ao menos uma pessoa que não participou do desenho.
- O dono aprova o símbolo. É o critério que os logos anteriores não cumpriram.

O prazo não foi definido na entrevista.

## Questões em aberto

- O desenho final da lamparina ainda não existe. Falta decidir para que lado a chama aponta e como ela se move em cada estado do agente (parado, ouvindo, pensando, concluiu, erro).
- Onde e como o texto da homenagem aparece no produto.
- O retrato do artista: se entra, onde entra e com qual autorização. Retrato, voz ou música só devem ir ao ar com autorização da família e licença das músicas; a entrevista recomendou a revisão de um advogado.
- Não houve busca de marca no INPI. A checagem do nome foi por busca na web e consulta de domínio.
- Um terceiro registrou `usecandeia.com` em agosto de 2026. Não se sabe o que será publicado ali.
- Qual endereço o produto usa, já que o `.com` não está disponível.
- O prazo da troca.
