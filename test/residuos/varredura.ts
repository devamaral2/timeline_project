import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Varredura de residuos da troca de "evento" por "tarefa".
 *
 * Acha "event" e "evento" usados como nome da entidade em codigo, textos,
 * prompts, esquema do banco e rotas das areas listadas em `RAIZES`. A lista de
 * excecoes (`EXCECOES`) e explicita e curta: cada uma tem um motivo.
 */

export const RAIZ_DO_REPOSITORIO = resolve(
  fileURLToPath(new URL(".", import.meta.url)),
  "../..",
);

/**
 * Pastas e arquivos varridos. `apps/mobile` e `scripts/mobile/` ficam de fora ate o Android
 * trocar de nome; `docs/` fora dos runbooks e `ops/` tambem (ver `CAMINHOS_IGNORADOS`).
 */
export const RAIZES = [
  "apps/web",
  "apps/api",
  "apps/auth",
  "apps/mcp",
  "packages/contracts",
  "packages/timeline",
  "packages/theme",
  "scripts",
  "infra",
  ".env.example",
  "env.tmpl",
  "docs/runbook",
  ".agents/docs",
];

/** Historico que nao se edita: migrations ja aplicadas (SQL e snapshots do drizzle). */
const CAMINHOS_IGNORADOS = [
  /^apps\/api\/drizzle\//,
  /^apps\/auth\/drizzle\//,
  // Android: o app so troca de nome no seu proprio ticket (paridade web/mobile).
  /^scripts\/mobile\//,
  /^docs\/runbook\/mobile-(rewrite|local-development)\.md$/,
];

/**
 * Arquivos cujo conteudo inteiro fala de outra coisa chamada "evento". O nome
 * do arquivo e as demais regras continuam valendo.
 */
export const ARQUIVOS_COM_OUTRO_EVENTO: { motivo: string; arquivo: RegExp }[] = [
  {
    motivo: "evento de auditoria e de log do Auth: registro de seguranca, nao a entidade",
    arquivo: /^apps\/auth\/src\/(audit\/|common\/logger\.ts$|features\/login-with-password\/postgres-login\.repository\.ts$|auth-core\/persistence\/postgres-session\.repository\.ts$|cleanup\/cleanup-auth-data\.ts$|testing\/(create-test-app|in-memory-audit-log)\.ts$)/,
  },
  {
    motivo: "eventos do stream de execucao do Hermes (`GET /v1/runs/{id}/events`): protocolo do Hermes, nao a entidade",
    arquivo: /^apps\/api\/src\/infrastructure\/hermes\/(hermes-trace|hermes\.client)[\w.-]*\.ts$/,
  },
  {
    motivo: "licencas das fontes (texto em ingles: \"IN NO EVENT SHALL\")",
    arquivo: /^apps\/web\/src\/fonts\//,
  },
  {
    motivo: "testes das migrations que renomeiam o banco e os dados do agente: gravam dados com os nomes antigos de proposito, para provar que a migration os troca",
    arquivo: /^apps\/api\/src\/infrastructure\/persistence\/integration\/(task-rename|agent-data)-migration\.integration\.test\.ts$/,
  },
  {
    motivo: "registro historico do pipeline de IA que saiu (ADRs 001 a 003, plano, estado e SQL do contexto do dia, `agent/fast`, `ai_processes`): descreve o que existiu, com os nomes da epoca",
    arquivo: /^\.agents\/docs\/ai-dialog\/(adr-00[123]-[\w-]+\.md|refactor-plan\.md|implementation-status\.md|day-context\.sql|turn-trace-queries\.sql)$/,
  },
  {
    motivo: "testes que provam que o nome antigo deixou de valer (campo, permissao, rota recusados): citam o nome antigo de proposito",
    arquivo: /^(apps\/api\/src\/api-core\/http-input-validation|apps\/api\/src\/architecture\/feature-organization\.architecture|apps\/auth\/src\/db\/migrations\.integration|apps\/auth\/src\/domain\/rbac\/permissions|packages\/contracts\/src\/schemas)\.test\.ts$/,
  },
];

const EXTENSOES_DE_TEXTO =
  /(\.(ts|tsx|js|jsx|mjs|cjs|css|scss|md|mdx|json|sql|ya?ml|html|txt|sh|toml|example|tmpl)|(^|\/)\.env)$/i;
const ARQUIVOS_IGNORADOS = /(^|\/)(pnpm-lock\.yaml|next-env\.d\.ts|tsconfig\.tsbuildinfo)$/;
const TAMANHO_MAXIMO = 1_000_000;

/**
 * Palavras (identificadores, caminhos, palavras de texto) com "event" que NAO
 * sao a entidade. Cada excecao precisa de um motivo.
 */
export const EXCECOES: { motivo: string; palavra: RegExp }[] = [
  {
    motivo: 'palavras comuns que so contem as letras: "prevent", "eventually", "eventual"/"eventuais"',
    palavra: /prevent|eventua(l|is)/i,
  },
  {
    motivo: "eventos de DOM e de teclado (tipos, ouvintes, dispatch) e utilitarios de teste deles",
    palavra:
      /^(add|remove)EventListener$|^dispatchEvent$|^createEvent$|^initEvent$|^(Custom|Keyboard|Mouse|Pointer|Change|Form|Touch|Focus|Drag|Clipboard|Submit|UI|Wheel|Input|Message|Composition|Animation|Transition|BeforeUnload|PageTransition|Progress|Storage|Error|Close|Hash|PopState|Security|Media|Toggle)Event$|^EventTarget$|^EventListener(OrObject)?$|^EventSource$|^(fire|user)Event$|^userEvent$|^user-event$|^eventPhase$|^nativeEvent$|^bubbles$|^useEffectEvent$|^MouseEventHandler$|^(Keyboard|Mouse|Pointer|Change|Form|Touch|Focus|Drag|Clipboard)EventHandler$|^(on|onchange)event$/i,
  },
  {
    motivo: "eventos de DOM do navegador citados por nome (SpeechRecognition, CSS pointer-events)",
    palavra: /^SpeechRecognition(Error)?Event$|^pointer-events$/,
  },
  {
    motivo: "nomes de eventos de DOM personalizados do app, disparados com window.dispatchEvent",
    palavra: /^(agendaRefreshEvent|hubOpenEvent|hermesDockEvent|VIEW_MODE_CHANGE_EVENT)$/,
  },
  {
    motivo: "evento de auditoria e de log do Auth: registro de seguranca, nao a entidade",
    palavra: /audit|^AuthLogEvent$/i,
  },
  {
    motivo: "text/event-stream: protocolo de Server-Sent Events, nao a entidade",
    palavra: /^event-stream$/i,
  },
];

/**
 * Excecoes que dependem da linha: a palavra so e liberada quando a linha tem o
 * formato indicado. `palavras` diz quais palavras da linha ela libera.
 */
export const EXCECOES_DE_LINHA: { motivo: string; linha: RegExp; palavras: RegExp; exigeContextoDeDom?: boolean }[] = [
  {
    motivo: "parametro `event` de handler de DOM: uso de propriedades e metodos do evento do navegador",
    // Vale so em arquivo com handler ou listener de DOM (`contextoDeEventoDeDom`).
    exigeContextoDeDom: true,
    linha:
      /\bevent\??\.(target|currentTarget|key|code|preventDefault|stopPropagation|stopImmediatePropagation|nativeEvent|clipboardData|dataTransfer|metaKey|ctrlKey|shiftKey|altKey|button|buttons|touches|changedTouches|detail|clientX|clientY|pageX|pageY|pointerId|pointerType|isComposing|repeat|persisted|matches|type|data|deltaY|deltaX|relatedTarget|submitter|isTrusted|defaultPrevented|results|resultIndex|error)\b/,
    palavras: /^event$/,
  },
  {
    motivo: "parametro `event` de handler de DOM (anotacao com tipo do navegador, cast, `onresult = (event) =>`) e interface que estende `Event`",
    linha: /\bevent\??:\s*(React\.)?\w*Event\b|\(event as \w*Event\b|\.on[a-z]+\s*=\s*\(event\)\s*=>|\bextends\s+Event\b/,
    palavras: /^(event|Event)$/,
  },
  {
    motivo: "parametro `event` de handler de DOM: arrow function de `onXxx={...}`",
    linha: /\bon[A-Z]\w*=\{\(?event\)?\s*=>/,
    palavras: /^event$/,
  },
  {
    motivo: "`new Event(...)` e `new CustomEvent(...)`: criam eventos de DOM",
    linha: /\bnew\s+(Custom)?Event\b/,
    palavras: /^(Event|CustomEvent)$/,
  },
  {
    motivo: "eventos de protocolos externos: campo `event` do stream do Hermes (`tool.started`, `run.failed`), a rota `/v1/runs/{id}/events` e os `events` do Kubernetes (`kubectl get events`)",
    linha: /(^|[^\w])"?event"?:\s*(["'`][a-z]+\.[a-z_]+["'`]|\$\{)|\/v1\/runs\/\S*\/events|kubectl\b.*\bget events\b|\bEvents do pod\b/,
    palavras: /^(event|events|Events)$/,
  },
  {
    motivo: "constante de teste da rota antiga: o teste prova que `/api/events` deixou de existir (404 na API, recusa no gateway)",
    linha: /^\s*(export )?const ROTA_ANTIGA = "\/api\/events";/,
    palavras: /^events$/,
  },
];

export type Residuo = {
  arquivo: string;
  /** Numero da linha (1-based); 0 para nome de arquivo ou de pasta. */
  linha: number;
  /** Texto da linha sem espacos nas pontas, ou "[nome de arquivo]"/"[nome de pasta]". */
  texto: string;
};

const CONTEM_EVENT = /event/i;

export function palavrasComEvent(texto: string): string[] {
  return (texto.match(/[A-Za-z0-9_-]+/g) ?? []).filter((p) => CONTEM_EVENT.test(p));
}

export function palavraExcetuada(palavra: string): boolean {
  return EXCECOES.some((e) => e.palavra.test(palavra));
}

/**
 * O arquivo declara um handler ou listener de evento de DOM (parametro `event` de handler,
 * `addEventListener`, `onXxx={(event) => ...}`, anotacao `event: KeyboardEvent`)? Sem isso,
 * `event.type`, `event.data` e afins sao o nome da entidade, nao o evento do navegador.
 */
export function contextoDeEventoDeDom(texto: string): boolean {
  return /\(\s*event\s*[:,)?]|\bevent\s*=>|\(event as \w*Event\b|addEventListener|\bon[A-Z]\w*=\{\(?event\b|\.on[a-z]+\s*=\s*\(event\)|\bevent\??:\s*(React\.)?\w*Event\b/.test(texto);
}

/**
 * Verdadeiro se a linha tem "event" como nome da entidade. `contextoDeDom` diz se o arquivo
 * tem handler de DOM; sem ele, a excecao de `event.<propriedade>` nao vale.
 */
export function linhaTemResiduo(linha: string, contextoDeDom = false): boolean {
  const palavras = palavrasComEvent(linha);
  if (palavras.length === 0) return false;
  const porLinha = EXCECOES_DE_LINHA.filter((e) => e.linha.test(linha) && (!e.exigeContextoDeDom || contextoDeDom));
  return palavras.some((palavra) => {
    if (palavraExcetuada(palavra)) return false;
    if (porLinha.some((e) => e.palavras.test(palavra))) return false;
    return true;
  });
}

function arquivosDoRepositorio(raiz: string): string[] {
  const saida = execFileSync(
    "git",
    ["ls-files", "-z", "--cached", "--others", "--exclude-standard", "--", ...RAIZES],
    { cwd: raiz, maxBuffer: 64 * 1024 * 1024 },
  ).toString("utf8");
  return [...new Set(saida.split("\0").filter(Boolean))].sort();
}

/** Acha todos os residuos do repositorio, em ordem estavel. */
export function varrer(raiz: string = RAIZ_DO_REPOSITORIO): Residuo[] {
  const residuos: Residuo[] = [];
  const pastasVistas = new Set<string>();
  for (const arquivo of arquivosDoRepositorio(raiz)) {
    if (CAMINHOS_IGNORADOS.some((r) => r.test(arquivo))) continue;
    if (ARQUIVOS_IGNORADOS.test(arquivo)) continue;
    const absoluto = join(raiz, arquivo);
    let tamanho: number;
    try {
      tamanho = statSync(absoluto).size;
    } catch {
      continue; // arquivo removido e ainda listado pelo git
    }

    const partes = arquivo.split("/");
    partes.forEach((parte, i) => {
      if (!CONTEM_EVENT.test(parte)) return;
      if (palavrasComEvent(parte).every(palavraExcetuada)) return;
      const ultimo = i === partes.length - 1;
      const caminho = partes.slice(0, i + 1).join("/");
      if (!ultimo) {
        if (pastasVistas.has(caminho)) return;
        pastasVistas.add(caminho);
      }
      residuos.push({
        arquivo: ultimo ? caminho : `${caminho}/`,
        linha: 0,
        texto: ultimo ? "[nome de arquivo]" : "[nome de pasta]",
      });
    });

    if (!EXTENSOES_DE_TEXTO.test(arquivo) || tamanho > TAMANHO_MAXIMO) continue;
    if (ARQUIVOS_COM_OUTRO_EVENTO.some((e) => e.arquivo.test(arquivo))) continue;
    const conteudo = readFileSync(absoluto, "utf8");
    const contextoDeDom = contextoDeEventoDeDom(conteudo);
    conteudo.split("\n").forEach((linha, i) => {
      if (linhaTemResiduo(linha, contextoDeDom)) {
        residuos.push({ arquivo, linha: i + 1, texto: linha.trim() });
      }
    });
  }
  return residuos;
}
