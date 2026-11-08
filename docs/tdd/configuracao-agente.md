---
status: draft
date: 2026-11-08
---

# TDD: Configuração editável do agente

## Contexto e objetivo
Os textos e parâmetros dos agentes (roteamento, entidade e consulta, e as skills) vivem em JSON e Markdown no repositório, lidos na subida do processo. Para mudar um texto hoje é preciso PR e deploy. O objetivo é editar pela aplicação, com efeito imediato, histórico, reversão e sincronização com o Hermes. Termos em [CONTEXT.md](../../CONTEXT.md).

## Fora de escopo
- Edição do modelo de cada rota (fica no repositório).
- Papel de editor e checagem de permissões novas (ver [ADR 0004](../adr/0004-edicao-restrita-ao-dono.md)).
- Teste de frases obrigatório antes de publicar: é opcional.

## Design proposto
- **Banco** guarda a configuração ativa e cada instantâneo (ADR 0001). A primeira carga vem do **padrão de fábrica** (arquivos em `apps/api/src/api-core/agent/config/` e `apps/api/src/api-core/process/`).
- **Publicação**: grava um instantâneo do conjunto inteiro e troca a versão ativa de forma atômica. O processo recarrega a configuração em memória, sem reiniciar (ADR 0002).
- **Reversão**: publica um instantâneo anterior como nova versão ativa, sem apagar o histórico.
- **Sincronização com o Hermes**: na mesma ação da publicação, lê o volume do Hermes, compara com a versão ativa e grava as skills e agentes publicados. Alteração detectada vira instantâneo com origem Hermes (ADR 0003).
- **Pendência**: se o Hermes não responder, a publicação fica válida e a sincronização entra numa fila que tenta a cada 5 minutos até conseguir.
- **Teste de frases**: ação opcional antes da publicação, que roda frases de exemplo pelo agente afetado.

## Dados e interfaces
- Tabela de configuração ativa e tabela de instantâneos, sem limite de quantidade. Cada instantâneo guarda o conjunto inteiro, a origem (dono, reversão ou Hermes) e a data.
- Tabela de pendências de sincronização: versão publicada, último erro e próxima tentativa.
- Rotas de publicação, reversão, leitura do histórico e sincronização manual, todas restritas ao dono.
- Validação na publicação: a configuração precisa carregar (estrutura e referências entre skills e roteador). O que a validação cobre exatamente fica em aberto.

## Alternativas descartadas
- **Repositório como fonte com PR**: não atende à edição pela aplicação (ADR 0001).
- **Reinício ou deploy para aplicar**: a edição precisa valer ao salvar (ADR 0002).
- **Reversão de um item isolado**: as peças se referem umas às outras por nome; desfazer uma sem as outras deixa o conjunto incoerente (ADR 0002).
- **Sobrescrever a alteração do Hermes em silêncio**: o Hermes pode reescrever suas skills, então a alteração precisa virar instantâneo (ADR 0003).

## Riscos e migração
- Um prompt ruim publicado atinge pedidos reais antes de ser notado. A reversão limita o tempo, não o dano (aceito, ADR 0002).
- A sincronização depende de a aplicação conseguir ler e escrever no volume `/opt/data` do Hermes. Hoje o caminho da API até esse volume não está definido (ver questões em aberto).
- Atualização diária do Hermes: cerca de um minuto de indisponibilidade por dia (Recreate), que vira pendência.
- Ordem sugerida: (1) banco e carga do padrão de fábrica, sem mudar comportamento; (2) publicação e reversão, ainda sem Hermes; (3) leitura do volume e sincronização com pendência; (4) tela de edição.

## Plano de testes
- Publicação troca a versão ativa sem reinício; pedidos concorrentes veem sempre uma versão inteira.
- Reversão devolve o conjunto completo e cria um novo instantâneo; o histórico anterior não some.
- Hermes fora do ar: publicação válida, pendência criada, repetição a cada 5 minutos, sincronização ao voltar.
- Alteração feita no volume entre duas sincronizações vira instantâneo com origem Hermes, e nada é sobrescrito em silêncio.
- Teste de frases opcional roda sem bloquear a publicação.
- Padrão de fábrica carrega igual ao repositório atual.

## Questões em aberto
- Caminho exato das skills no volume `/opt/data` e se o Hermes recarrega sem reinício. A documentação oficial aponta `~/.hermes/skills`; não foi verificado na versão instalada.
- Comando de recarga de skills da versão instalada do Hermes (`hermes --help` no container).
- Como a API acessa o volume do Hermes em produção (mount compartilhado, serviço ou MCP) e em local.
- O que a validação na publicação cobre exatamente (apenas estrutura, ou também referências entre roteador e skills).
- Quais parâmetros do `agents.json` ficam editáveis além de limites e timeouts (o modelo está fora, por decisão).
