# Fase 11 — Corte final

## 1. Objetivo

Docker Compose desligado e removido, `/opt/stack` arquivado, coleta do Docker retirada do
Alloy, runbook e checklist de segurança reescritos para a plataforma nova, e a medição de
sete dias comparada com a Fase 0.

## 2. Por que isso existe

Uma migração que não termina é pior que uma migração que não começou. Duas plataformas no
mesmo servidor significam duas coisas para atualizar, dois lugares onde um serviço pode
estar rodando, e a possibilidade permanente de alguém — você, com pressa — subir o
container antigo por engano e ter duas versões escrevendo no mesmo banco.

O Compose ficou de pé de propósito desde a Fase 5, como caminho de volta. Essa apólice tem
prazo: passado tempo suficiente para confiar no cluster, ela vira risco em vez de proteção.

A fase também fecha o ciclo aberto na Fase 0. Aquele documento pediu sete dias de medição
para servir de régua. Aqui a régua é usada — e é a única forma de responder objetivamente
se a migração valeu.

## 3. Passo a passo

### 3.1 — Pré-requisito: tempo e evidência

⚠️ Não execute esta fase antes de:

1. **duas semanas** de produção no cluster sem incidente que exigisse voltar;
2. um **restore testado** a partir do armazenamento externo depois do corte;
3. a medição de sete dias completa;
4. ao menos um **deploy completo pelo Flux**, do commit ao rollout;
5. ao menos um **rollback** executado de verdade, não só ensaiado.

Os cinco existem porque cada um cobre uma forma diferente de descobrir tarde demais que o
cluster não estava pronto.

### 3.2 — Comparar com a Fase 0

Preencha ao lado da tabela da Fase 0:

| Métrica | Fase 0 (Compose) | Fase 11 (k3s) | Variação |
|---|---|---|---|
| p95 timeline | | | |
| p95 rotas de IA | | | |
| taxa de erro | | | |
| RAM total em uso | | | |
| RAM em pico | | | |
| tempo de deploy | | | |
| janela de indisponibilidade no deploy | segundos | **zero** | |

Duas linhas merecem interpretação honesta:

**RAM em uso vai subir.** Control plane, observabilidade local e LiteLLM não existiam. O
número que importa não é o total, é a folga: acima de 4 GiB livres, está saudável.

**p95 das rotas de IA pode ter melhorado ou piorado.** Cache do LiteLLM puxa para baixo;
o salto extra pelo proxy e um Hermes mais lento puxam para cima. Se piorou, o trace da
Fase 8 mostra exatamente onde — e essa é a prova de que a Fase 8 valeu.

Se algum número piorou sem explicação, **investigue antes de desligar o Compose**. Depois
desta fase, comparar fica difícil.

### 3.3 — Desligar e arquivar

```bash
# 🖥️ servidor — parar tudo, sem remover ainda
docker compose -f /opt/stack/apps/docker-compose.yml down
docker compose -f /opt/stack/data/docker-compose.yml down
docker compose -f /opt/stack/traefik/docker-compose.yml down
docker compose -f /opt/stack/observability/docker-compose.yml down
docker ps -a
```

Espere **mais uma semana** com tudo parado, mas presente. Se nada faltar nesse período,
nada faltava.

```bash
# 🖥️ servidor — arquivar a configuracao antes de remover
tar czf /opt/backups/stack-compose-arquivo.tar.gz /opt/stack
```

⚠️ Esse arquivo contém os `.env` em texto claro, com senha de banco e chave de API. Ele vai
para o mesmo destino externo do backup, com a mesma proteção — e as credenciais que ainda
estiverem em uso devem ser rotacionadas, já que agora existem em dois lugares.

```bash
# 🖥️ servidor — remover volumes so depois de conferir os PVCs do cluster
docker volume ls
docker volume rm stack_pgdata stack_redisdata
docker system prune -a --volumes
```

⚠️ O `docker volume rm` do `pgdata` apaga a **última cópia local** do banco anterior. Só
execute com o backup externo validado e o cluster estável há semanas. Não há desfazer.

### 3.4 — Limpar a coleta do Docker

O Alloy vinha coletando os dois lados desde a Fase 2. Remova os componentes de descoberta
e log do Docker, e confirme que nenhum painel do Grafana ficou vazio — os que ficarem
apontavam para métrica do Compose e precisam ser reescritos para as métricas do cluster.

Aproveite para tirar o socket do Docker dos mounts. Ele era, nas palavras do próprio v1,
uma capacidade muito privilegiada; agora não é mais necessário.

### 3.5 — Reescrever runbook e checklist

[`15-runbook-operacao.md`](15-runbook-operacao.md) e
[`14-seguranca-checklist.md`](14-seguranca-checklist.md) foram escritos ao longo das fases
com os dois mundos em mente. Aqui eles perdem o mundo antigo:

- todo `docker compose` vira `kubectl` ou `flux`;
- o procedimento de deploy manual vira commit no git, com a exceção documentada de
  `flux suspend` para emergência;
- o item sobre socket do Docker sai;
- entram os itens de superfície Kubernetes: acesso ao kubeconfig, `6443`, RBAC, chave age.

### 3.6 — Fechar as pendências acumuladas

| Pendência | Origem | Ação |
|---|---|---|
| `insecureSkipVerify` na ponte | Fase 3 | conferir que `bridge.yml` não existe mais |
| `hostPort` 8080/8443 | Fase 3 | conferir que não há mais bind nessas portas |
| Usuário `ci` e `deploy-from-ci` | Fase 6 | conferir que foram removidos |
| Secrets `VPS_*` no GitHub | Fase 6 | conferir que foram apagados |
| Dashboards ainda só na UI | Fase 2 | migrar para o git |
| Retenções provisórias | Fase 2 | ajustar com o uso real de disco |
| Postgres do Compose parado | Fase 4 | removido em 3.3 |

## 4. Por que não fazer diferente

**Manter o Compose indefinidamente como plano B.** Confortável, e o custo aparente é
baixo — os containers estão parados. O custo real é ambiguidade: dois lugares onde um
serviço pode estar, dois conjuntos de configuração divergindo, e um caminho para alguém
subir a versão antiga. Um plano B que envelhece deixa de ser plano B; o backup validado é
o plano B de verdade.

**Desligar o Compose logo depois da Fase 5.** Libera RAM e remove a ambiguidade mais cedo.
Descartado porque as duas primeiras semanas são justamente quando o problema não previsto
aparece, e é quando o caminho de volta vale mais.

**Manter a coleta do Docker por segurança.** Sem containers Docker, ela coleta nada e
mantém o socket montado. Custo sem benefício.

## 5. Como garantir que está certo

```bash
# 🖥️ servidor
docker ps -a
docker volume ls
```

Esperado: nenhum container, nenhum volume da stack antiga. O Docker em si pode continuar
instalado — o containerd do k3s é independente dele.

```bash
# 🖥️ servidor
free -h
df -h /
```

Esperado: folga acima de 4 GiB e disco com margem depois da limpeza.

```bash
# ☸️ cluster
kubectl get pods -A
flux get all -A
```

Esperado: tudo `Running` e `Ready: True`, com a revisão do `main` atual.

```bash
# 💻 local
nmap -Pn -p 1-1024,3000,3001,4000,5432,6379,6443,8080,8443 SEU_IP
curl -I https://app.SEUDOMINIO.com/health
curl -I https://api.SEUDOMINIO.com/health
```

Esperado: apenas `22`, `80` e `443` abertas; `200` nos dois hosts.

E o teste final, que só é possível agora: **recriar o servidor no papel**. Escreva, em uma
página, os passos para reconstruir tudo a partir do git e do backup externo, num VPS novo.
Se algum passo depender de um arquivo que só existe no servidor atual, esse arquivo é uma
falha de recuperação de desastre — e encontrá-la assim é muito melhor que encontrá-la
depois.

## 6. Armadilhas comuns

**Remover o volume `pgdata` cedo demais.** ⚠️ Descrito em 3.3. É a ação irreversível desta
fase.

**Arquivo de configuração arquivado sem rotacionar credenciais.** Descrito em 3.3.

**Painéis do Grafana silenciosamente vazios.** Descrito em 3.4. O sintoma é um dashboard
que parece funcionando porque não dá erro — só não tem dado.

**Runbook desatualizado.** Um runbook que manda rodar `docker compose logs` num servidor
sem Compose é pior que nenhum: ele é lido no meio de um incidente, quando ninguém tem
paciência de descobrir que está errado.

**Declarar a migração concluída sem a comparação.** Sem a tabela de 3.2 preenchida, não há
resposta para a pergunta se valeu a pena — e essa era metade do objetivo.

## 7. Para estudar

- 🆓 [Google SRE Book, cap. 15 — Postmortem Culture](https://sre.google/sre-book/postmortem-culture/) — vale escrever um retrospecto desta migração enquanto está fresco.
- 🆓 [The Twelve-Factor App](https://12factor.net/) — reler depois de tudo pronto rende mais que antes; vários princípios só fazem sentido depois de você ter sentido a falta deles.
- 🆓 [Kubernetes — Cluster Administration overview](https://kubernetes.io/docs/concepts/cluster-administration/)
