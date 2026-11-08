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
Agente que cria ou edita uma entidade da agenda: evento, nota comum, nota de refeição ou evento recorrente.
_Avoid_: especialista, skill

**Agente de consulta**:
Agente que lê entidades da agenda para responder ao usuário, sem criar nem editar.
_Avoid_: leitor, query
