# Staging efêmero de IA

O compose em `infra/ai-staging/` é separado de `infra/docker-compose.local.yml`
e usa volumes/nome de projeto próprios.

1. Copie `.env.example` para um local não versionado.
2. Preencha imagens e segredos fora do Git.
3. Suba primeiro o perfil `ia-staging` (dependências).
4. Suba `ia-staging-app` somente após validar imagens e rede.
5. Exponha a aplicação apenas por proxy autenticado e com TTL.
6. Execute `down` ao finalizar e aplique a política de retenção dos volumes.

Antes de usar em VPS, ainda é necessário validar isolamento de rede, proxy,
limites de CPU/memória e limpeza automática (RAF-117).
