# Runbook — executar o app Android/Kotlin localmente

Este documento descreve, do início ao fim, como preparar a máquina, subir o
backend local e executar o app Android nativo em Kotlin + Jetpack Compose.

O procedimento foi escrito para quem ainda não tem o Android SDK configurado.
Todos os comandos devem ser executados a partir da raiz do repositório, salvo
quando o próprio passo indicar o contrário. Os blocos sem indicação de sistema
operacional usam Bash; no Windows, execute-os pelo Git Bash ou WSL. Os blocos
PowerShell são identificados explicitamente.

## Resultado esperado

Ao terminar este runbook, você deverá conseguir:

1. iniciar um emulador Android ou conectar um aparelho físico;
2. confirmar que o dispositivo aparece em `adb devices`;
3. iniciar PostgreSQL, API e Auth localmente;
4. compilar e instalar o APK debug;
5. abrir o Braid no dispositivo;
6. fazer login e acessar a agenda usando o backend local.

O fluxo local usa estas portas por padrão:

| Serviço | Porta padrão | Uso pelo app |
|---|---:|---|
| Web | `3000` | Opcional; usado para comparar a experiência mobile |
| API | `3001` | Eventos, tags e chat |
| Auth | `3002` | Login, sessão, refresh e logout |
| PostgreSQL | `54391` | Banco local da API e do Auth |

As portas da API e do Auth podem ser diferentes em uma worktree isolada. Nesse
caso, o arquivo `.env.local` é a fonte de verdade.

## 1. Pré-requisitos da máquina

### 1.1 Sistema operacional

O desenvolvimento é suportado em Linux, macOS ou Windows com Android Studio.
No Windows, execute os comandos deste documento no PowerShell ou no Git Bash,
conforme indicado. O projeto usa scripts POSIX para algumas rotinas; para ter
menos diferenças, WSL2 é recomendado quando o desenvolvimento for feito no
Windows.

### 1.2 Node.js

O monorepo exige Node.js 24 ou superior.

Verifique a instalação:

```bash
node --version
```

O resultado deve começar com `v24` ou ser uma versão maior.

Se o comando não existir, instale o Node.js 24 LTS ou superior antes de
continuar. Depois de instalar, feche e reabra o terminal e repita a verificação.

### 1.3 pnpm

O repositório declara `pnpm@11.24.0`. Ative o Corepack e confirme a versão:

```bash
corepack enable
corepack pnpm --version
```

O resultado esperado é `11.24.0` ou outra versão `11.x` compatível com o
repositório.

Se `corepack enable` falhar por falta de permissão no Linux ou macOS, use um
terminal com permissão para instalar os shims do Corepack ou configure o pnpm
11 globalmente. Não use pnpm 8 ou pnpm 9 neste projeto.

### 1.4 Docker

O PostgreSQL local é iniciado pelo Docker Compose.

Instale e inicie o Docker Desktop (macOS/Windows) ou o Docker Engine com o
plugin Compose (Linux). Confirme:

```bash
docker --version
docker compose version
```

O daemon precisa estar em execução. Teste isso com:

```bash
docker info
```

Se `docker info` retornar erro de conexão, inicie o Docker antes de prosseguir.

### 1.5 Acesso ao 1Password Environment

O backend não guarda segredos de desenvolvimento no Git. Os scripts de
execução carregam as variáveis pelo 1Password SDK.

Você precisa ter:

- uma Service Account com acesso de leitura ao Environment local;
- o token dessa Service Account;
- o identificador do Environment, normalmente `timeline-local`;
- acesso às variáveis descritas em `.env.example`.

Se você não tiver esse acesso, pare neste ponto e peça ao responsável pelo
ambiente local o token e o nome do Environment. Não coloque o token em arquivos
do repositório, `.env.example`, commits, screenshots ou mensagens de log.

## 2. Instalar e configurar o Java/JDK

O módulo Android gera bytecode compatível com Java/Kotlin 17, mas o projeto
padroniza JDK 21 para executar Gradle e CI. Use JDK 21 nos comandos de Gradle e
configure o Android Studio para usar o mesmo JDK. O alvo 17 do compilador não
significa que o JDK de execução precise ser 17.

Verifique a versão atual:

```bash
java -version
javac -version
```

Os dois comandos devem indicar a versão 21.

### 2.1 Linux — Ubuntu/Debian

Instale o JDK:

```bash
sudo apt update
sudo apt install openjdk-21-jdk
```

Descubra o caminho instalado:

```bash
readlink -f "$(command -v java)"
```

O `JAVA_HOME` deve apontar para a pasta que contém `bin/java`, por exemplo
`/usr/lib/jvm/java-21-openjdk-amd64`. Adicione ao arquivo do seu shell:

```bash
export JAVA_HOME="/usr/lib/jvm/java-21-openjdk-amd64"
export PATH="$JAVA_HOME/bin:$PATH"
```

Reabra o terminal ou carregue o arquivo de configuração do shell. Depois
confirme novamente `java -version` e `javac -version`.

### 2.2 Linux — Fedora/RHEL

Instale o JDK:

```bash
sudo dnf install java-21-openjdk-devel
```

Configure `JAVA_HOME` usando o caminho retornado por:

```bash
dirname "$(dirname "$(readlink -f "$(command -v java)")")"
```

Exemplo:

```bash
export JAVA_HOME="/usr/lib/jvm/java-21-openjdk"
export PATH="$JAVA_HOME/bin:$PATH"
```

### 2.3 macOS

Instale o JDK 21 por Android Studio, Homebrew ou outro distribuidor confiável.
Depois descubra o caminho:

```bash
/usr/libexec/java_home -V
```

Configure o JDK 21 na sessão atual:

```bash
export JAVA_HOME="$(/usr/libexec/java_home -v 21)"
export PATH="$JAVA_HOME/bin:$PATH"
```

Para manter a configuração, coloque essas duas linhas no `~/.zshrc` e abra um
novo terminal.

### 2.4 Windows PowerShell

Instale o JDK 21 e localize a pasta, por exemplo:

```text
C:\Program Files\Java\jdk-21
```

Configure a sessão atual do PowerShell:

```powershell
$env:JAVA_HOME = "C:\Program Files\Java\jdk-21"
$env:Path = "$env:JAVA_HOME\bin;$env:Path"
```

Confirme:

```powershell
java -version
javac -version
```

Para persistir a configuração, use as variáveis de ambiente do Windows ou o
comando `setx`. Depois de alterar variáveis persistentes, abra um novo terminal.

### 2.5 Configurar o Gradle JDK no Android Studio

Mesmo que `JAVA_HOME` esteja correto, o Android Studio pode usar outro JDK.

1. Abra o Android Studio.
2. Abra **Settings** no Windows/Linux ou **Android Studio > Settings** no macOS.
3. Entre em **Build, Execution, Deployment > Build Tools > Gradle**.
4. Em **Gradle JDK**, selecione o JDK 21.
5. Clique em **Apply** e depois em **OK**.

Se o Android Studio mostrar apenas o JDK embutido, adicione o diretório de
instalação do JDK 21 pelo seletor de JDK.

## 3. Instalar o Android Studio e o Android SDK

### 3.1 Instalar o Android Studio

1. Baixe o Android Studio no [site oficial do Android Developers](https://developer.android.com/studio).
2. Execute o instalador.
3. Escolha a instalação **Standard**, quando essa opção aparecer.
4. Aceite a instalação do Android SDK, Android SDK Platform-Tools e Android
   Emulator.
5. Abra o Android Studio ao terminar.

Se o Android Studio já estiver instalado, abra-o e continue pelo SDK Manager.

### 3.2 Instalar os componentes do SDK

Abra o SDK Manager:

1. Na tela inicial, clique em **More Actions > SDK Manager**; ou, com um
   projeto aberto, use **Tools > SDK Manager**.
2. Anote o **Android SDK Location** exibido no topo da janela.
3. Na aba **SDK Platforms**, marque **Android API 37** ou **Android SDK
   Platform 37**, pois o projeto usa `compileSdk = 37`.
4. Na aba **SDK Tools**, marque:
   - **Android SDK Build-Tools**;
   - **Android SDK Platform-Tools**;
   - **Android Emulator**;
   - **Android SDK Command-line Tools (latest)**.
5. Clique em **Apply**.
6. Aceite as licenças exibidas.
7. Aguarde o download terminar sem fechar o Android Studio.

Se a API 37 não aparecer, atualize o Android Studio e o SDK Manager. Não altere
`compileSdk` no código apenas para contornar uma instalação incompleta.

### 3.3 Configurar `ANDROID_HOME` e o `PATH`

O Android Studio consegue localizar o SDK sozinho, mas os comandos `adb`,
`emulator` e `sdkmanager` precisam estar no `PATH` quando executados pelo
terminal.

Use o caminho mostrado no SDK Manager.

#### Linux

O caminho usual é `$HOME/Android/Sdk`. Para a sessão atual:

```bash
export ANDROID_HOME="$HOME/Android/Sdk"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
export PATH="$ANDROID_HOME/platform-tools:$PATH"
export PATH="$ANDROID_HOME/emulator:$PATH"
export PATH="$ANDROID_HOME/cmdline-tools/latest/bin:$PATH"
```

Coloque as mesmas linhas em `~/.bashrc` ou `~/.zshrc`, de acordo com o shell
usado, e abra um novo terminal.

#### macOS

O caminho usual é `$HOME/Library/Android/sdk`:

```bash
export ANDROID_HOME="$HOME/Library/Android/sdk"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
export PATH="$ANDROID_HOME/platform-tools:$PATH"
export PATH="$ANDROID_HOME/emulator:$PATH"
export PATH="$ANDROID_HOME/cmdline-tools/latest/bin:$PATH"
```

Adicione as linhas ao `~/.zshrc` e abra um novo terminal.

#### Windows PowerShell

O caminho usual é `$env:LOCALAPPDATA\Android\Sdk`:

```powershell
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
$env:ANDROID_SDK_ROOT = $env:ANDROID_HOME
$env:Path = "$env:ANDROID_HOME\platform-tools;$env:ANDROID_HOME\emulator;$env:ANDROID_HOME\cmdline-tools\latest\bin;$env:Path"
```

Para instalações feitas em outro diretório, substitua o caminho pelo valor
mostrado no SDK Manager.

### 3.4 Validar o SDK

Feche e reabra o terminal e execute:

```bash
echo "$ANDROID_HOME"
command -v adb
command -v emulator
command -v sdkmanager
adb version
```

No Windows PowerShell, use `Get-Command adb`, `Get-Command emulator` e
`Get-Command sdkmanager` no lugar de `command -v`.

Os três executáveis precisam ser encontrados. Se `adb` não for encontrado,
volte ao passo 3.3 e confirme o caminho do SDK.

Opcionalmente, aceite as licenças pelo terminal:

```bash
yes | sdkmanager --licenses
```

Se o comando `yes` não existir no Windows, execute `sdkmanager --licenses` e
responda `y` a cada licença solicitada.

### 3.5 Criar um `local.properties` se o Gradle não encontrar o SDK

Normalmente o Android Studio cria esse arquivo automaticamente. Se o Gradle
mostrar `SDK location not found`, crie manualmente `apps/mobile/local.properties`
com uma única linha apontando para o SDK.

Linux:

```properties
sdk.dir=/home/SEU_USUARIO/Android/Sdk
```

macOS:

```properties
sdk.dir=/Users/SEU_USUARIO/Library/Android/sdk
```

Windows, usando barras normais:

```properties
sdk.dir=C:/Users/SEU_USUARIO/AppData/Local/Android/Sdk
```

Substitua `SEU_USUARIO` pelo seu usuário real. Esse arquivo é local e não deve
ser commitado.

## 4. Criar e iniciar um dispositivo Android

Você pode usar um emulador ou um aparelho físico. O emulador é o caminho mais
reprodutível para desenvolvimento.

### 4.1 Criar um emulador pelo Android Studio

1. Abra **Tools > Device Manager**.
2. Clique em **Create device**.
3. Escolha um telefone, por exemplo Pixel, e clique em **Next**.
4. Selecione uma imagem de sistema com API 37.
5. Se a imagem estiver marcada como ausente, clique em **Download** e aguarde.
6. Escolha a arquitetura recomendada para sua máquina:
   - `x86_64` em computadores Intel/AMD;
   - `arm64-v8a` em computadores ARM, quando disponível.
7. Clique em **Next**, mantenha a orientação padrão e clique em **Finish**.
8. No Device Manager, clique no botão de iniciar do novo dispositivo.
9. Aguarde a tela inicial do Android aparecer completamente.

Se o emulador estiver lento ou não iniciar, habilite a virtualização no BIOS/UEFI
e instale o hypervisor apropriado ao sistema operacional.

### 4.2 Iniciar um emulador pelo terminal

Liste os AVDs disponíveis:

```bash
emulator -list-avds
```

Inicie o AVD substituindo `NOME_DO_AVD` pelo nome retornado:

```bash
emulator -avd NOME_DO_AVD
```

Mantenha esse terminal aberto enquanto usa o app ou inicie o processo em
background conforme o comportamento do seu shell.

### 4.3 Usar um aparelho físico

1. Abra **Settings > About phone** no aparelho.
2. Toque sete vezes em **Build number** para habilitar as opções de
   desenvolvedor.
3. Em **Developer options**, habilite **USB debugging**.
4. Conecte o aparelho por USB.
5. Aceite a confirmação da chave RSA no aparelho.
6. Execute `adb devices` no computador.

O estado precisa ser `device`. Se aparecer `unauthorized`, desbloqueie o
aparelho e aceite a janela de autorização. Se aparecer `offline`, desconecte e
conecte o cabo novamente.

### 4.4 Validar o dispositivo

Execute:

```bash
adb start-server
adb devices
```

Resultado esperado, para emulador:

```text
List of devices attached
emulator-5554    device
```

Se não houver uma linha com estado `device`, não avance para a instalação do
APK.

## 5. Preparar o checkout do monorepo

### 5.1 Ir para a raiz correta

A raiz é a pasta que contém o `package.json` principal:

```bash
cd /caminho/para/timeline_project/main
test -f package.json
test -d apps/mobile
```

No Windows PowerShell:

```powershell
Set-Location C:\caminho\para\timeline_project\main
Test-Path package.json
Test-Path apps/mobile
```

Se qualquer verificação falhar, você está em outra pasta.

### 5.2 Instalar as dependências JavaScript

A instalação deve ser feita na raiz:

```bash
corepack pnpm install --frozen-lockfile
```

Se o lockfile não corresponder aos manifests, não remova arquivos para forçar a
instalação. Verifique se a branch está atualizada e rode a instalação normal
somente se a alteração do lockfile for intencional:

```bash
corepack pnpm install
```

### 5.3 Abrir o módulo Android no Android Studio

O projeto Gradle Android fica em `apps/mobile`, não na raiz do monorepo.

1. No Android Studio, escolha **Open**.
2. Selecione a pasta `apps/mobile`.
3. Confirme que o módulo `app` aparece no painel **Project**.
4. Aguarde o Gradle Sync terminar.
5. Se aparecer uma solicitação de JDK, selecione o JDK 21 configurado no passo
   2.5.
6. Se aparecer uma solicitação para instalar SDK ou Build Tools, aceite e
   aguarde.

O Android Studio pode permanecer aberto, mas os comandos oficiais deste runbook
continuam sendo executados a partir da raiz pelo pnpm.

## 6. Configurar o ambiente local do backend

O app Kotlin debug aponta, por padrão, para:

```text
API:  http://localhost:3001
Auth: http://localhost:3002
```

O script `pnpm dev:mobile` usa `adb reverse` para fazer o `localhost` do
emulador/aparelho apontar para a máquina de desenvolvimento. Portanto, o
backend precisa estar rodando no computador, e não dentro do emulador.

### 6.1 Definir as credenciais do 1Password

No terminal usado para iniciar os serviços, defina as variáveis:

```bash
export OP_SERVICE_ACCOUNT_TOKEN='COLE_AQUI_O_TOKEN_LOCAL'
export OP_ENVIRONMENT_ID='timeline-local'
```

Não coloque aspas adicionais no valor real além das aspas usadas pelo shell e
não salve essas linhas em um arquivo versionado.

Valide o acesso:

```bash
pnpm secrets:check
```

Resultado esperado:

```text
[1Password] acesso confirmado ao Environment 'timeline-local'
```

Se aparecer `OP_SERVICE_ACCOUNT_TOKEN não está definido`, exporte o token no
mesmo terminal. Se aparecer variável ausente, peça ao responsável pelo
Environment para completar a configuração; não invente valores para chaves de
criptografia, banco ou autenticação.

Para manter as variáveis entre sessões, configure-as no mecanismo de segredos
aprovado pela equipe. Consulte também
[`onepassword.md`](./onepassword.md).

### 6.2 Escolher o tipo de checkout

Há dois caminhos:

- **Worktree principal:** siga o passo 6.3 e crie `.env.local` manualmente.
- **Worktree secundária:** siga o passo 6.4 e deixe o script de provisionamento
  escolher portas e banco isolados.

Não misture os dois caminhos no mesmo checkout sem entender qual `.env.local`
está ativo.

### 6.3 Configurar a worktree principal

Este passo cria apenas configurações locais não secretas. As credenciais ficam
no 1Password.

Abra ou crie o arquivo `.env.local` na raiz com o editor de sua preferência:

```bash
${EDITOR:-vi} .env.local
```

Insira exatamente estas linhas:

```dotenv
WEB_PORT=3000
API_PORT=3001
API_HOST=127.0.0.1
AUTH_PORT=3002
AUTH_HOST=127.0.0.1
POSTGRES_HOST_PORT=54391
AUTH_POSTGRES_DB=lifecomposure_auth
COMPOSE_PROJECT_NAME=braid-main
```

Salve o arquivo e confirme que ele existe:

```bash
test -f .env.local
```

Não adicione `POSTGRES_PASSWORD`, `DATABASE_URL`, `AUTH_KEY_ENCRYPTION_KEY` ou
outros segredos a esse arquivo. O loader do 1Password calcula as URLs do banco
usando as variáveis secretas e os valores locais de porta.

Se alguma das portas estiver ocupada, escolha outras portas livres e use os
mesmos números em todo o procedimento. Por exemplo, se API usar `3101` e Auth
`3102`, altere `API_PORT` e `AUTH_PORT` no `.env.local`; o script mobile lerá
esses valores automaticamente.

### 6.4 Configurar uma worktree secundária

Em uma worktree secundária, execute na raiz:

```bash
pnpm worktree:provision
```

Esse comando:

1. calcula portas livres;
2. cria `.env.local` com essas portas;
3. sobe um PostgreSQL isolado;
4. cria a base separada do Auth;
5. aplica as migrations da API e do Auth;
6. executa o build dos packages.

O comando não provisiona a worktree principal por segurança. Não use
`FORCE_MAIN=1` sem ter certeza de que deseja substituir o `.env.local` e o
ambiente local da principal.

Ao terminar, anote as portas exibidas no resumo do comando. Elas serão usadas
automaticamente por `pnpm dev:mobile`, desde que o `.env.local` permaneça na
raiz dessa mesma worktree.

## 7. Subir PostgreSQL e aplicar migrations

### 7.1 Worktree principal

Com `OP_SERVICE_ACCOUNT_TOKEN`, `OP_ENVIRONMENT_ID` e `.env.local` configurados,
suba o PostgreSQL:

```bash
pnpm secrets:exec -- docker compose \
  --env-file .env.local \
  --project-name braid-main \
  -f infra/docker-compose.local.yml up -d
```

Verifique o container:

```bash
pnpm secrets:exec -- docker compose \
  --env-file .env.local \
  --project-name braid-main \
  -f infra/docker-compose.local.yml ps
```

O serviço `postgres` deve estar `running` e saudável.

Aplique as migrations da API:

```bash
pnpm secrets:exec -- pnpm db:migrate
```

Aplique as migrations do Auth:

```bash
pnpm secrets:exec -- pnpm --filter @repo/auth run db:migrate
```

As duas migrations são obrigatórias. A API e o Auth usam schemas e tabelas
independentes no PostgreSQL.

### 7.2 Worktree secundária

Se você executou `pnpm worktree:provision`, não repita os comandos desta seção:
o provisionamento já subiu o PostgreSQL e aplicou as migrations.

Se o provisionamento falhou antes das migrations, corrija a mensagem de erro e
execute novamente:

```bash
pnpm worktree:provision
```

O script é idempotente e reaproveita o ambiente quando encontra o projeto Docker
já em execução.

## 8. Subir API e Auth

Mantenha dois terminais abertos na raiz do repositório. Ambos precisam ter as
variáveis `OP_SERVICE_ACCOUNT_TOKEN` e `OP_ENVIRONMENT_ID` configuradas.

### Terminal A — API

```bash
pnpm dev:api
```

### Terminal B — Auth

```bash
pnpm dev:auth
```

Os processos ficam em modo watch. Não feche esses terminais enquanto usar o app.

Como alternativa, um único comando sobe web, API e Auth:

```bash
pnpm dev
```

O web não é necessário para abrir o app Android, mas é útil para comparação
visual e para acessar a tela web de login.

### 8.1 Verificar API e Auth

Em um terceiro terminal, confirme que a documentação está respondendo:

```bash
curl -f http://127.0.0.1:3001/docs
curl -f http://127.0.0.1:3002/docs
```

No PowerShell, use:

```powershell
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:3001/docs
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:3002/docs
```

Se você usa portas diferentes, substitua `3001` e `3002` pelos valores de
`API_PORT` e `AUTH_PORT` em `.env.local`.

Se os comandos retornarem erro de conexão:

1. confirme que os terminais A e B continuam em execução;
2. confira as portas em `.env.local`;
3. confira o log do processo que falhou;
4. valide novamente `pnpm secrets:check`;
5. valide o PostgreSQL com:

   ```bash
   pnpm secrets:exec -- docker compose \
     --env-file .env.local \
     --project-name braid-main \
     -f infra/docker-compose.local.yml ps
   ```

## 9. Configurar as URLs do app Kotlin

### 9.1 Usando as portas padrão

Se API e Auth usam `3001` e `3002`, nenhuma alteração é necessária. O build
debug usa estes fallbacks:

```text
braid.apiUrl=http://localhost:3001
braid.authUrl=http://localhost:3002
```

### 9.2 Usando portas diferentes

Crie ou edite `apps/mobile/local.properties` e adicione:

```properties
braid.apiUrl=http://localhost:PORTA_DA_API
braid.authUrl=http://localhost:PORTA_DO_AUTH
```

Exemplo, se `.env.local` usa API `3101` e Auth `3102`:

```properties
braid.apiUrl=http://localhost:3101
braid.authUrl=http://localhost:3102
```

Esse arquivo também pode conter `sdk.dir`. Não substitua uma linha `sdk.dir`
existente; apenas acrescente as propriedades `braid.*`.

Use `localhost`, não o IP `10.0.2.2`, quando executar pelo fluxo padrão deste
runbook. O script `scripts/mobile/dev.sh` configura o encaminhamento com
`adb reverse`.

## 10. Compilar e testar o app

### 10.1 Rodar os testes unitários Kotlin

Com o SDK configurado, execute na raiz:

```bash
pnpm --filter @repo/mobile run test
```

Esse comando não precisa de um emulador, mas precisa do JDK, do Android SDK e
das dependências Gradle disponíveis.

### 10.2 Verificar lint

```bash
pnpm --filter @repo/mobile run lint
```

O comando executa `ktlintCheck` e `lintDebug`.

### 10.3 Gerar o APK debug

```bash
pnpm --filter @repo/mobile run build
```

O APK esperado é gerado em:

```text
apps/mobile/app/build/outputs/apk/debug/app-debug.apk
```

Você não precisa gerar keystore ou definir variáveis de release para este passo.

## 11. Instalar e abrir o app

### 11.1 Caminho recomendado: `pnpm dev:mobile`

Confirme primeiro o dispositivo:

```bash
adb devices
```

Depois, na raiz do repositório, execute:

```bash
pnpm dev:mobile
```

O script faz, nesta ordem:

1. lê `API_PORT` e `AUTH_PORT` de `.env.local` ou `.env`;
2. executa `adb reverse` para API e Auth;
3. executa `installDebug` pelo Gradle;
4. abre `app.braid.mobile/.MainActivity`.

Ao final, o aplicativo Braid deve aparecer no dispositivo. A primeira execução
pode demorar porque o Gradle baixa o wrapper e as dependências.

Confirme os encaminhamentos:

```bash
adb reverse --list
```

Você deve ver as portas da API e do Auth encaminhadas para o host.

### 11.2 Caminho manual

Se precisar executar cada etapa separadamente:

```bash
API_PORT=3001
AUTH_PORT=3002
adb reverse "tcp:${API_PORT}" "tcp:${API_PORT}"
adb reverse "tcp:${AUTH_PORT}" "tcp:${AUTH_PORT}"
pnpm --filter @repo/mobile run android
```

Troque os números pelas portas reais. O comando `android` instala o debug e
abre a Activity principal, mas não configura `adb reverse` sozinho.

### 11.3 Caminho pelo Android Studio

1. Abra o projeto `apps/mobile`.
2. Aguarde o Gradle Sync.
3. Na barra superior, selecione a configuração `app`.
4. Selecione o emulador ou aparelho com estado `device`.
5. Clique em **Run**.

Antes de usar o botão **Run**, execute manualmente:

```bash
adb reverse tcp:3001 tcp:3001
adb reverse tcp:3002 tcp:3002
```

Se usar portas diferentes, substitua os números. O botão do Android Studio
instala e abre o app, mas não lê automaticamente `API_PORT` e `AUTH_PORT` do
`.env.local`.

## 12. Fazer login no primeiro uso

Ao abrir um banco novo, o app mostra a tela de login.

Use uma conta de desenvolvimento já existente, se a equipe fornecer uma.

Se o ambiente local estiver vazio e a política do projeto permitir criar uma
conta administrativa, configure `ADMIN_PASSWORD` no Environment local do
1Password e execute:

```bash
pnpm secrets:exec -- pnpm --filter @repo/auth run create-admin
```

Esse comando cria ou atualiza a conta:

```text
E-mail: admin@admin.com
Senha: o valor de ADMIN_PASSWORD do Environment local
```

Não passe a senha na linha de comando e não a coloque em `.env.local`.

Preencha o e-mail e a senha na tela do app. Após o login, o app deve chamar a
API com um bearer token e abrir a agenda.

## 13. Validação completa

Considere a execução concluída somente quando todos os itens abaixo forem
verdadeiros:

- [ ] `node --version` mostra Node 24 ou superior.
- [ ] `corepack pnpm --version` mostra pnpm 11.
- [ ] `java -version` e `javac -version` mostram JDK 21.
- [ ] `adb version` funciona.
- [ ] `adb devices` mostra pelo menos um dispositivo com estado `device`.
- [ ] O PostgreSQL local está saudável.
- [ ] As migrations da API foram aplicadas.
- [ ] As migrations do Auth foram aplicadas.
- [ ] API responde em `/docs`.
- [ ] Auth responde em `/docs`.
- [ ] `pnpm --filter @repo/mobile run test` passa.
- [ ] `pnpm --filter @repo/mobile run build` passa.
- [ ] `adb reverse --list` mostra API e Auth.
- [ ] O APK debug foi instalado.
- [ ] A tela de login aparece.
- [ ] O login é aceito.
- [ ] A agenda carrega dados ou uma agenda vazia sem erro de rede.

Para observar os logs do processo Android:

```bash
adb logcat --pid="$(adb shell pidof app.braid.mobile)"
```

Se `pidof` não retornar um PID, abra o app novamente e repita o comando.

## 14. Encerrar a sessão de desenvolvimento

Para parar API e Auth, volte aos terminais correspondentes e pressione
`Ctrl+C`.

Para remover apenas os containers, preservando os dados do PostgreSQL:

```bash
pnpm secrets:exec -- docker compose \
  --env-file .env.local \
  --project-name braid-main \
  -f infra/docker-compose.local.yml down
```

Para worktrees secundárias, use o nome do projeto Docker exibido por
`pnpm worktree:provision`.

Não use `docker compose down -v` como rotina: `-v` remove o volume e apaga os
dados locais do banco. Só faça isso quando quiser reiniciar deliberadamente o
ambiente do zero.

Para remover o encaminhamento de portas do dispositivo:

```bash
adb reverse --remove-all
```

Para desinstalar o app debug, sem alterar o código:

```bash
adb uninstall app.braid.mobile
```

## 15. Problemas comuns

### `adb: command not found`

O `platform-tools` não está no `PATH`.

1. Abra o SDK Manager e copie o Android SDK Location.
2. Confirme que existe `<SDK>/platform-tools/adb`.
3. Adicione `<SDK>/platform-tools` ao `PATH` conforme o passo 3.3.
4. Feche e reabra o terminal.
5. Execute `adb version` novamente.

### `no devices/emulators found`

O emulador não está iniciado ou o aparelho não foi autorizado.

1. Inicie o AVD no Device Manager.
2. Aguarde a tela inicial terminar de carregar.
3. Execute `adb kill-server` e `adb start-server`.
4. Execute `adb devices`.
5. Em aparelho físico, desbloqueie a tela e aceite a chave RSA.

### `SDK location not found`

O Gradle não encontrou o SDK.

1. Confirme `ANDROID_HOME`.
2. Confirme que o diretório existe.
3. Crie `apps/mobile/local.properties` com `sdk.dir=...` conforme o passo 3.5.
4. Rode novamente o build.

### `Android Gradle plugin requires Java 17` ou erro relacionado ao JDK

O Android Gradle Plugin exige no mínimo Java 17, mas este projeto padroniza JDK
21 para manter o ambiente local igual ao CI.

1. Execute `java -version` no terminal.
2. Corrija `JAVA_HOME` para o JDK 21.
3. Configure **Gradle JDK** como JDK 21 no Android Studio.
4. Feche processos Gradle antigos:

   ```bash
   (cd apps/mobile && ./gradlew --stop)
   ```

5. Tente novamente.

### `Failed to find target with hash string android-37`

O SDK Platform 37 não está instalado.

1. Abra o SDK Manager.
2. Instale **Android SDK Platform 37**.
3. Instale ou atualize **Android SDK Build-Tools**.
4. Rode o build novamente.

### `pnpm secrets:check` falha

Verifique, nesta ordem:

1. Verifique o token sem imprimi-lo:

   ```bash
   if [ -n "${OP_SERVICE_ACCOUNT_TOKEN:-}" ]; then
     echo "OP_SERVICE_ACCOUNT_TOKEN definido"
   else
     echo "OP_SERVICE_ACCOUNT_TOKEN ausente"
   fi
   ```

   Se estiver ausente, exporte o token novamente.
2. `echo "$OP_ENVIRONMENT_ID"` retorna o Environment correto.
3. A Service Account tem acesso ao Environment.
4. As variáveis obrigatórias de `.env.example` estão preenchidas no 1Password.

Não substitua uma chave ausente por valor aleatório.

### `docker compose` não inicia o PostgreSQL

1. Execute `docker info`.
2. Confirme que `POSTGRES_USER`, `POSTGRES_PASSWORD` e `POSTGRES_DB` existem
   no Environment do 1Password.
3. Confirme `POSTGRES_HOST_PORT` em `.env.local`.
4. Verifique se a porta já está ocupada.
5. Inspecione os logs:

   ```bash
   pnpm secrets:exec -- docker compose \
     --env-file .env.local \
     --project-name braid-main \
     -f infra/docker-compose.local.yml logs postgres
   ```

### API ou Auth não iniciam

1. Confirme que o PostgreSQL está saudável.
2. Execute as migrations novamente.
3. Confirme `API_PORT` e `AUTH_PORT`.
4. Verifique se outra aplicação já usa as portas.
5. Leia a primeira mensagem de erro do terminal; erros posteriores podem ser
   apenas consequência da primeira falha.

### O app abre, mas mostra erro de rede

1. Confirme API e Auth com `curl` no host.
2. Confirme o dispositivo com `adb devices`.
3. Execute `adb reverse --list`.
4. Refaça os encaminhamentos:

   ```bash
   adb reverse tcp:3001 tcp:3001
   adb reverse tcp:3002 tcp:3002
   ```

5. Se as portas não forem padrão, atualize `apps/mobile/local.properties`.
6. Reinstale o debug com `pnpm dev:mobile`.
7. Leia o Logcat para identificar se o erro é de API, Auth ou autenticação.

### O login retorna erro

1. Confirme que o Auth está respondendo em `/docs`.
2. Confirme que as migrations do Auth foram aplicadas.
3. Confirme e-mail e senha.
4. Se o banco for novo, crie a conta de desenvolvimento com `create-admin` e
   `ADMIN_PASSWORD`, conforme o passo 12.
5. Apague a instalação do app somente se precisar limpar uma sessão persistida:

   ```bash
   adb uninstall app.braid.mobile
   pnpm dev:mobile
   ```

### O Gradle não consegue baixar dependências

O primeiro build precisa de acesso à internet para baixar o Gradle e as
bibliotecas Maven.

1. Confirme acesso a `services.gradle.org`, `dl.google.com` e Maven Central.
2. Verifique proxy ou VPN corporativa.
3. Tente novamente sem interromper o download.
4. Não apague o cache global do Gradle como primeira tentativa.

## 16. Comandos de referência rápida

Depois que a máquina já estiver configurada, o fluxo diário é:

```bash
cd /caminho/para/timeline_project/main

# uma vez por checkout ou quando o lockfile mudar
corepack pnpm install --frozen-lockfile

# em terminais separados, com 1Password configurado
pnpm dev:api
pnpm dev:auth

# com o emulador/aparelho já em `adb devices`
pnpm dev:mobile
```

Antes da primeira execução em uma máquina nova, conclua todos os passos deste
documento; a sequência curta acima pressupõe SDK, JDK, Docker, banco e acesso
ao 1Password já configurados.

## Referências do repositório

- [`README.md`](../../README.md) — visão geral do monorepo e versões mínimas.
- [`mobile-rewrite.md`](./mobile-rewrite.md) — arquitetura e plano da reescrita
  nativa.
- [`onepassword.md`](./onepassword.md) — configuração do Environment local.
- [`mobile-release.md`](../mobile-release.md) — somente para build release e
  assinatura; não é necessário para desenvolvimento debug.
- [`scripts/mobile/dev.sh`](../../scripts/mobile/dev.sh) — `adb reverse`,
  instalação e abertura do app.
- [`apps/mobile/app/build.gradle.kts`](../../apps/mobile/app/build.gradle.kts) —
  SDK, JDK, URLs debug e dependências Android.
