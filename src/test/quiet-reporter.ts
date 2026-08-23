import { isAbsolute, relative } from "node:path";
import { inspect } from "node:util";
import type { Reporter } from "vitest/reporters";
import type { File, Task } from "vitest";

/** Limites para impedir que um unico erro (ex.: snapshot grande) exploda a saida. */
const MAX_MESSAGE_CHARS = 1500;
const MAX_VALUE_CHARS = 400;
const MAX_STACK_FRAMES = 12;

interface CollectedTask {
  task: Task;
  /** Caminho do arquivo relativo a raiz do projeto. */
  file: string;
  /** Cadeia `describe > describe > teste`. */
  title: string;
}

interface FailureDetail {
  file: string;
  title: string;
  error?: unknown;
}

/**
 * Reporter de saida minima, feito para agentes de IA.
 *
 * - Suite verde: imprime apenas `Tests pass`.
 * - Suite vermelha: imprime o primeiro teste que quebrou (arquivo, nome, erro,
 *   diff e a linha de origem) e quantos testes falharam. Nada mais.
 *
 * `onUserConsoleLog` e um no-op de proposito: sem ele o Vitest cairia no
 * comportamento padrao e repassaria os `console.log` dos testes ao terminal.
 */
export class QuietReporter implements Reporter {
  onUserConsoleLog(): void {
    // Silencio: logs de teste nao entram na saida.
  }

  onFinished(files: File[] = [], errors: unknown[] = []): void {
    const tests = collectTests(files);
    const failedTests = tests.filter(({ task }) => task.result?.state === "fail");
    const failures = failedTests.length
      ? failedTests.map(toFailure)
      : collectNonTestFailures(files, errors);

    if (!failures.length) {
      write("Tests pass");
      return;
    }

    write(
      [
        renderFailure(failures[0]),
        "",
        renderCount(failedTests.length, tests.length, failures.length),
      ].join("\n"),
    );
  }
}

/**
 * Percorre a arvore de tasks de cima para baixo acumulando apenas os testes
 * folha. O titulo e montado na descida porque o ponteiro `suite` de volta ao pai
 * nao chega populado ao reporter.
 */
function collectTests(files: File[]): CollectedTask[] {
  const tests: CollectedTask[] = [];

  const walk = (task: Task, file: string, ancestors: string[]): void => {
    if (task.type === "suite") {
      for (const child of task.tasks) walk(child, file, [...ancestors, task.name]);
      return;
    }
    tests.push({ task, file, title: [...ancestors, task.name].join(" > ") });
  };

  for (const file of files) {
    // O task raiz do arquivo tem o caminho como nome; ele fica fora do titulo.
    const path = relativeFile(file.filepath);
    for (const child of file.tasks) walk(child, path, []);
  }

  return tests;
}

function toFailure({ file, title, task }: CollectedTask): FailureDetail {
  return { file, title, error: task.result?.errors?.[0] };
}

/**
 * Falhas que nao pertencem a nenhum teste: erro de import/coleta, `beforeAll`
 * que estourou, ou erro nao tratado reportado fora da arvore de tasks.
 */
function collectNonTestFailures(files: File[], errors: unknown[]): FailureDetail[] {
  const failures: FailureDetail[] = [];

  const walk = (task: Task, file: string, ancestors: string[]): void => {
    if (task.result?.state === "fail" && task.result.errors?.length) {
      const title = [...ancestors, task.name].join(" > ");
      failures.push({
        file,
        title: title ? `${title} (falha fora de um teste)` : "",
        error: task.result.errors[0],
      });
    }
    if (task.type === "suite") {
      for (const child of task.tasks) walk(child, file, [...ancestors, task.name]);
    }
  };

  for (const file of files) {
    const path = relativeFile(file.filepath);
    if (file.result?.state === "fail" && file.result.errors?.length) {
      failures.push({ file: path, title: "", error: file.result.errors[0] });
    }
    for (const child of file.tasks) walk(child, path, []);
  }

  for (const error of errors) {
    failures.push({ file: "unhandled error", title: "", error });
  }

  return failures;
}

function renderFailure(failure: FailureDetail): string {
  const header = failure.title ? `FAIL ${failure.file} > ${failure.title}` : `FAIL ${failure.file}`;
  return [header, ...renderError(failure.error)].join("\n");
}

function renderError(error: unknown): string[] {
  if (!error || typeof error !== "object") {
    return error === undefined ? [] : [`  ${truncate(String(error), MAX_MESSAGE_CHARS)}`];
  }

  const err = error as {
    name?: string;
    message?: string;
    expected?: unknown;
    actual?: unknown;
    stack?: string;
    stackStr?: string;
  };

  const name = err.name ?? "Error";
  const message = truncate(err.message ?? "", MAX_MESSAGE_CHARS);
  const lines = [`  ${message ? `${name}: ${message}` : name}`];

  // `showDiff` sozinho nao serve de condicao: erros de coleta chegam com ele
  // ligado e com os dois lados serializados como "undefined".
  if (hasComparableValue(err.expected) || hasComparableValue(err.actual)) {
    lines.push(`  expected: ${format(err.expected)}`);
    lines.push(`  actual:   ${format(err.actual)}`);
  }

  lines.push(...renderStack(err.stack ?? err.stackStr));

  return lines;
}

interface StackFrame {
  method?: string;
  file: string;
  line: string;
  column: string;
}

/**
 * Cadeia de chamadas ate o ponto do erro, restrita ao codigo do projeto. Todo
 * stack termina nos mesmos frames de `@vitest/runner` e `node:internal`, que sao
 * ruido puro; descarta-los deixa visivel so o caminho que o time escreveu.
 *
 * Quando o erro nasce inteiro dentro de uma dependencia nao sobra nenhum frame
 * do projeto — nesse caso mostra o topo do stack cru, para nao perder a origem.
 */
function renderStack(stack?: string): string[] {
  const frames = parseStack(stack);
  const project = frames.filter(isProjectFrame);
  const relevant = project.length ? project : frames;
  const visible = relevant.slice(0, MAX_STACK_FRAMES);
  const hidden = relevant.length - visible.length;

  const lines = visible.map(formatFrame);
  if (hidden > 0) lines.push(`  … (+${hidden} frames)`);
  return lines;
}

function parseStack(stack?: string): StackFrame[] {
  const frames: StackFrame[] = [];

  for (const raw of stack?.split("\n") ?? []) {
    // `at nome (/caminho:1:2)` ou `at /caminho:1:2`; frames sem posicao
    // (`at async Promise.all (index 0)`) nao casam e sao ignorados.
    const match = /^at\s+(?:(.*?)\s+\()?(.+?):(\d+):(\d+)\)?$/.exec(raw.trim());
    if (!match) continue;

    frames.push({
      method: match[1],
      file: match[2].replace(/^file:\/\//, ""),
      line: match[3],
      column: match[4],
    });
  }

  return frames;
}

function isProjectFrame({ file }: StackFrame): boolean {
  // Frames internos do Node chegam como `node:internal/...`, sem caminho absoluto.
  if (!isAbsolute(file) || file.includes("node_modules")) return false;

  const path = relative(process.cwd(), file);
  return Boolean(path) && !path.startsWith("..");
}

function formatFrame({ method, file, line, column }: StackFrame): string {
  const position = `${relativeFile(file)}:${line}:${column}`;
  return method ? `  at ${method} (${position})` : `  at ${position}`;
}

/** O Vitest serializa os lados da comparacao como texto; "undefined" significa ausente. */
function hasComparableValue(value: unknown): boolean {
  return value !== undefined && value !== "undefined";
}

function renderCount(failedTests: number, totalTests: number, failureCount: number): string {
  if (!failedTests) {
    const noun = failureCount === 1 ? "failure" : "failures";
    return `${failureCount} ${noun} outside of tests (${totalTests} tests collected)`;
  }
  return `${failedTests} of ${totalTests} tests failed`;
}

function relativeFile(filepath: string): string {
  const path = relative(process.cwd(), filepath);
  return path && !path.startsWith("..") ? path : filepath;
}

/** O Vitest ja serializa `expected`/`actual` como texto; so o resto precisa de inspect. */
function format(value: unknown): string {
  const text =
    typeof value === "string"
      ? value
      : inspect(value, { depth: 2, breakLength: 120, maxArrayLength: 20, maxStringLength: 200 });
  return truncate(text, MAX_VALUE_CHARS).replace(/\s*\n\s*/g, " ");
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}… [truncado]` : text;
}

function write(text: string): void {
  process.stdout.write(`${text}\n`);
}
