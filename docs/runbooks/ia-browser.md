# Runner Playwright remoto

O `infra/ai-browser/` produz um runner descartável. Ele não guarda cookies,
não reutiliza perfil e fecha browser/contexto mesmo quando o smoke falha.

Os artefatos são opcionais e devem ser montados em `.ia/runtime/playwright/`,
que é ignorado pelo Git. A camada de execução precisa restringir a rede ao
staging, autenticar o operador e remover artefatos após o TTL.

Validação local da imagem:

```bash
docker build -t timeline-ia-playwright infra/ai-browser
TARGET_URL=http://127.0.0.1:18080
```

O smoke real depende de um staging acessível; por isso a RAF-116 só fica
completamente concluída após a execução na VPS.
