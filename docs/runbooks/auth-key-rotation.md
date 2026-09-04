# Rotação de chave de assinatura

Verifique antes que `AUTH_KEY_ENCRYPTION_KEY` é a KEK ativa e que o banco está
migrado. Execute:

```bash
pnpm --filter @repo/auth run rotate-signing-key
```

Uma nova chave fica ativa e a anterior fica `retiring`, ainda publicada no JWKS
até `retire_after`. O cleanup aposenta a chave depois desse instante, remove o
material privado e mantém somente a JWK pública até ela sair do conjunto
publicável. Nunca troque a KEK antes de recriptografar as chaves existentes.
