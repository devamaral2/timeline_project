# ADR-004 — Traefik v3 como reverse proxy

**Status:** aceita · **Data:** 2026-08-25

## Contexto

É preciso um único ponto de entrada que termine TLS, roteie por domínio para múltiplos
containers, obtenha certificados automaticamente e aplique políticas transversais (rate
limit, headers de segurança, autenticação).

As aplicações são adicionadas e removidas com frequência, via CI/CD.

## Decisão

**Traefik v3**, com descoberta automática pelo provider Docker e configuração dinâmica
por arquivo para os middlewares compartilhados.

## Alternativas consideradas

**Caddy.** Genuinamente mais simples: HTTPS automático com três linhas de Caddyfile, sem
distinção entre configuração estática e dinâmica. Consome menos memória. **Para um caso
simples, seria a escolha recomendada.** Descartado por dois motivos: o provider de Docker
é um plugin de terceiros, menos maduro que o do Traefik; e o Traefik é o que aparece em
ambientes profissionais, então o aprendizado transfere melhor.

**Nginx Proxy Manager.** Interface web agradável, fácil de começar. O problema é que a
configuração vive num SQLite dentro do container: não é versionável, não é reproduzível, e
recriar do zero significa reconfigurar tudo pela interface. Configuração como código é
requisito aqui.

**Nginx puro + certbot.** Máximo controle e desempenho comprovado. Custa escrever cada
bloco `server` manualmente e integrar a renovação por cron. Adicionar uma app significa
editar arquivo e recarregar — o oposto do fluxo automatizado do CI/CD.

**HAProxy.** Excelente balanceador, mas TLS automático exige integração externa e a
configuração é mais rígida. Desproporcional para este porte.

**Cloudflare Tunnel (sem proxy local).** Elimina a necessidade de abrir portas — o agente
abre conexão de saída. Segurança de rede excelente. Descartado como solução principal por
criar dependência total de um terceiro para o site existir; permanece documentado como
opção na [Fase 5](../07-fase-5-traefik-e-tls.md).

## Consequências

**Positivas.** Adicionar uma aplicação exige apenas labels no compose dela — nenhum
arquivo do proxy é editado e não há reload manual. TLS automático com renovação
transparente. Middlewares reutilizáveis entre rotas. Dashboard para inspecionar
roteamento. Habilidade valorizada no mercado.

**Negativas.** A distinção entre configuração estática e dinâmica confunde no começo e é a
maior fonte de erros. Precisa acessar `/var/run/docker.sock`, que é privilégio equivalente
a root — o maior risco isolado desta arquitetura. Mais memória que o Caddy (~50MB vs
~30MB). Mensagens de erro pouco descritivas: frequentemente uma rota simplesmente não
funciona, sem log explicativo.

**Mitigações.** O `exposedByDefault: false` impede exposição acidental de containers. O
`api.insecure: false` protege o dashboard. Para o socket, o próximo passo é o
`tecnativa/docker-socket-proxy` — está no
[checklist de segurança](../11-seguranca-checklist.md), item 2.11.

## Quando revisitar

- Se a complexidade do Traefik atrapalhar mais do que ajudar, migrar para Caddy é legítimo
- Se surgir necessidade de balanceamento sofisticado (sticky sessions complexas, health
  checks ativos elaborados), avalie HAProxy
- Se o provedor bloquear portas ou o IP for dinâmico, Cloudflare Tunnel passa à frente
