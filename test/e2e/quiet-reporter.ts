import type { FullResult, Reporter, TestCase } from "@playwright/test/reporter";

export default class QuietReporter implements Reporter {
  private failed: string[] = [];
  private errors: string[] = [];

  onTestEnd(test: TestCase): void {
    const result = test.results.at(-1);
    if (result?.status !== "failed" && result?.status !== "timedOut") return;
    const message = result.errors.map((error) => error.message ?? String(error)).join("\n");
    this.failed.push(`${test.titlePath().join(" > ")}\n${message}`);
  }

  onError(error: Error): void {
    this.errors.push(error.message);
  }

  onEnd(result: FullResult): void {
    if (result.status === "passed" && !this.failed.length && !this.errors.length) {
      process.stdout.write("Tests pass\n");
      return;
    }
    for (const failure of [...this.errors, ...this.failed]) process.stderr.write(`${failure}\n`);
    process.stderr.write(`E2E tests ${result.status}\n`);
  }
}
