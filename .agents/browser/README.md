# Navegador headless Playwright

O runner é uma unidade efêmera: cada execução cria um contexto isolado e
fecha-o ao terminar. A imagem do Playwright fornece os browsers e o script
recebe `TARGET_URL` somente pelo ambiente.

```bash
docker build -t timeline-ia-playwright .agents/browser
docker run --rm --network host \
  -e TARGET_URL=http://127.0.0.1:18080 \
  -e ARTIFACT_DIR=/artifacts \
  -v "$PWD/.agents/runtime/playwright:/artifacts" \
  timeline-ia-playwright
```

Não monte perfis persistentes nem publique a porta do runner. A rota protegida
e a retenção dos artefatos precisam ser fornecidas pelo ambiente da VPS.
