# Configuração editável do agente

Textos e parâmetros que definem como os agentes decidem e agem (roteamento, criação, edição e consulta de entidades da agenda, e as skills do Hermes). Editáveis pela aplicação pelo dono, com histórico.

## Language

**Configuração do agente**:
Texto de um agente (de roteamento, de entidade ou de consulta) e das skills que ele usa. Editada agente por agente, não em uma tela única. Vive no banco, com versões.
_Avoid_: prompt solto, config do repositório, tela de textos

**Parâmetro editável**:
Limite ou tempo que um agente usa para executar: passos, custo, timeouts e limiar de certeza do roteador. O modelo de cada rota não é editável.
_Avoid_: configuração técnica, opção

**Padrão de fábrica**:
Versão da configuração que vem do repositório. Serve de ponto de partida e de volta para o original.
_Avoid_: seed, default, versão inicial

**Versão ativa**:
A versão da configuração que está em vigor agora para todos os pedidos.
_Avoid_: versão atual, release

**Reversão**:
Voltar a versão ativa para uma versão anterior do histórico.
_Avoid_: rollback, desfazer

**Sincronização com o Hermes**:
Copiar para o volume do Hermes as skills e os agentes que a aplicação publicou. Roda junto da publicação e lê o volume antes de escrever.
_Avoid_: deploy do Hermes, envio ao Hermes

**Pendência de sincronização**:
Publicação que vale na aplicação mas ainda não chegou ao Hermes. Fica visível e é repetida a cada 5 minutos até sincronizar.
_Avoid_: erro, falha de sincronização

**Alteração do Hermes**:
Mudança que o próprio Hermes faz numa skill ou agente, sem passar pela aplicação. Detectada ao ler o volume e registrada num instantâneo com origem Hermes.
_Avoid_: edição do Hermes, divergência

**Agente de roteamento**:
Agente que decide, a partir de um pedido, para qual agente ele segue.
_Avoid_: roteador, classificador

**Agente de entidade**:
Agente que cria ou edita uma entidade da agenda: evento, artefato ou evento recorrente.
_Avoid_: especialista, skill

**Agente de consulta**:
Agente que lê entidades da agenda para responder ao usuário, sem criar nem editar.
_Avoid_: leitor, query

### Agenda

**Evento**:
Algo que uma pessoa ou um agente faz ou vai fazer. É a única entidade de ação: o que antes era tarefa passa a ser um evento. Pode ter o status acompanhado ou servir só de referência na agenda.
_Avoid_: tarefa (como entidade separada), item, atividade

**Evento de referência**:
Evento sem status, que só marca um horário na agenda. Continua editável e pode passar a ter o status acompanhado a qualquer momento.
_Avoid_: evento stateless, agendado, evento azul

**Evento longo**:
Evento de pessoa, sempre com status, que fica fora da agenda, como um projeto. Pode ter início real e prazo, mas nenhuma data o coloca na agenda. O trabalho nele aparece na agenda como subtarefas com horário. Não se repete e não vira perdido: com o prazo vencido, fica atrasado. Todo evento que duraria mais de 31 dias é um evento longo.
_Avoid_: projeto, épico, registro longo, tarefa sem data

**Agenda**:
A grade de horários. Mostra os eventos de pessoa e de agente que têm início e não são longos, juntos ou cada executor em separado. Passos não aparecem nela.
_Avoid_: calendário, timeline, linha do tempo

**Fim planejado**:
Quando o evento deve terminar: o fim do bloco na agenda ou, num evento longo, o prazo. É diferente da conclusão, que é o momento em que o evento de fato terminou.
_Avoid_: fim, data final, término

**Executor**:
Quem realiza o evento: uma pessoa ou um agente. Cada um tem o seu próprio conjunto de status, e um evento de agente sempre tem status.
_Avoid_: bot, responsável, dono

**Artefato**:
Objeto que guarda conteúdo e não é um fluxo: não tem status, horário nem executor. É editável. Quem registra que ele foi criado, alterado ou usado é um evento. Substitui a nota.
_Avoid_: nota (como entidade; fica só como rótulo de tela do artefato de texto), anexo, documento

**Relação**:
Ligação com sentido entre eventos e artefatos. Vai de quem produz para o que foi produzido: o evento de origem cria o artefato ou gera o evento de destino. Entre evento e artefato, parte sempre do evento, que cria, altera, usa ou apaga o artefato.
_Avoid_: vínculo, link, pai e filho

**Alimento**:
Artefato com calorias e receita. Não se distingue alimento de refeição. O que foi comido num evento é um alimento próprio daquele evento, copiado do original com a quantidade, para que editar o original não mude o passado. A cópia é marcada como derivada e não aparece na lista de alimentos.
_Avoid_: refeição pronta, item do catálogo, nota de refeição

**Artefato global**:
Artefato sem dono, que todos leem e ninguém edita pelo app. Só existe para alimentos e exercícios.
_Avoid_: catálogo, item de sistema

**Pedido**:
Evento executado por um agente a partir de algo que o usuário pediu, ainda sem classificação.
_Avoid_: prompt, comando, tarefa do agente

**Pedido de pesquisa**:
Pedido para o agente descobrir algo que o usuário ainda não sabe: pesquisa de conceitos e de tudo o que for novo.
_Avoid_: busca, consulta

**Pedido de esclarecimento**:
Pedido em que o agente faz perguntas ao usuário até esclarecer todos os pontos de uma decisão.
_Avoid_: entrevista, consulta, dúvida

**Pedido de construção**:
Pedido para o agente produzir um artefato.
_Avoid_: geração, criação

**Pedido de revisão**:
Pedido para o agente revisar algo que já foi produzido.
_Avoid_: checagem, auditoria

**Execução agendada**:
Evento de agente que roda sozinho num horário definido, sem um pedido do usuário naquele momento. Na tela, o tipo aparece escrito como `cron`.
_Avoid_: cron (como nome do conceito), automação, rotina do agente

**Passo**:
Evento de agente em que um pedido se desdobra, executado por um agente interno. É uma subtarefa do pedido e não aparece na lista de pedidos do usuário nem na agenda.
_Avoid_: etapa, step do processo, processo

**Sessão**:
O primeiro pedido e todos os pedidos que continuam a mesma conversa. Não é uma entidade: é a relação que parte do primeiro pedido para cada continuação.
_Avoid_: conversa (como entidade), thread, chat

**Entrada**:
Registro acrescentado a um evento e nunca alterado: mensagem, pensamento, trace, resultado ou insumo de um passo. O texto do usuário só aparece em mensagens, pensamentos e insumos.
_Avoid_: log, histórico, trace (como termo geral)

**Subtarefa**:
Evento em que um evento maior se desdobra. É uma relação, então pode pertencer a mais de um evento maior, e apagar o maior não apaga a subtarefa.
_Avoid_: filho, tarefa filha

**Bloqueio**:
Relação em que concluir um evento libera outro.
_Avoid_: dependência, pré-requisito

### Marca

**Candeia**:
Nome público do produto e do agente com quem o usuário fala. Tratado no masculino: o Candeia. Escrito em minúsculas na assinatura, sem linha de apoio.
_Avoid_: Braid, Lede, Hermes, Agente pessoal, Assistente

**Lamparina**:
O símbolo do Candeia: uma candeia de bico, com corpo em tinta e chama em verde-água na ponta, voltada para a frente. É o ícone do app e também o sinal do agente.
_Avoid_: trança, Síntese trançada, onda, logo

**Chama**:
A parte da lamparina que se move para mostrar o estado do agente. É o único ponto verde-água do símbolo.
_Avoid_: onda, glifo do Hermes, círculo do agente

**Homenagem**:
A declaração, feita pela marca, de que o nome vem do sambista Candeia. O agente leva o nome, mas nunca fala como se fosse o artista.
_Avoid_: persona, personagem, inspiração
