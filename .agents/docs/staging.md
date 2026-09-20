# Ambiente local efêmero de IA

O compose em `.agents/environments/local/` é separado de
`infra/docker-compose.local.yml` e usa volumes/nome de projeto próprios.

1. Copie `.agents/environments/local/.env.example` para
   `.agents/environments/local/.env`.
2. Preencha imagens e segredos fora do Git.
3. Suba primeiro o perfil `ia-staging` (dependências).
4. Suba `ia-staging-app` somente após validar imagens e rede.
5. Mantenha as portas vinculadas a `127.0.0.1`.
6. Execute `down` ao finalizar e aplique a política de retenção dos volumes.

Valide isolamento de rede, limites de CPU/memória, TTL e limpeza automática
antes de considerar o ambiente pronto (RAF-117).
