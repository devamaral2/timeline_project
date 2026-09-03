# Checklist de pré-corte

A lista que precisa estar **inteira** marcada antes de executar o passo 3.5 da
[Fase 5](../07-fase-5-web-e-api.md) — o momento em que o tráfego real muda de caminho.

Existe separada porque é a única lista desta spec que se lê de pé, minutos antes de
começar, e porque um item esquecido aqui custa o site fora do ar.

## Reversibilidade

- [ ] Backup gerado hoje, enviado para fora e **restaurado** com sucesso
- [ ] Contagem de linhas e `max(created_at)` conferidos no restore
- [ ] Procedimento de volta escrito, em uma página, com os comandos exatos
- [ ] 🔴 `api.env` do Compose já apontando para o banco **do cluster**
- [ ] Compose de aplicação parado, mas presente e capaz de subir
- [ ] Caminho de volta cronometrado: cabe em dois minutos

## Prontidão do cluster

- [ ] Todos os pods de `prod` em `Running` e `READY`
- [ ] Teste manual por `port-forward`: login, timeline e criação de evento
- [ ] Uma rota de IA testada de ponta a ponta
- [ ] NetworkPolicy aplicada e testada, com DNS e egress 443 liberados
- [ ] `qosClass` do banco é `Guaranteed`
- [ ] Rollout com tráfego contínuo já testado, sem erro

## Observabilidade de plantão

- [ ] Grafana acessível e com dado recente
- [ ] Alerta de disco ativo
- [ ] Sonda externa ativa e já testada de verdade
- [ ] Baseline da Fase 0 aberto numa aba, para comparar em tempo real

## Certificados

- [ ] Issuer de staging emitiu com sucesso para o host de produção
- [ ] HSTS **desligado**
- [ ] Cota do Let's Encrypt não queimada nos últimos sete dias

## Condições humanas

- [ ] Janela de baixa atividade
- [ ] Tempo disponível: o dobro do estimado
- [ ] Critério de aborto da Fase 0 relido
- [ ] Você não está com pressa, com sono, nem prestes a sair

O último item não é piada. Metade das decisões ruins desta lista são tomadas por alguém
que queria terminar antes de dormir.
