import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";

const targetUrl = process.env.TARGET_URL;
if (!targetUrl) throw new Error("TARGET_URL is required");

const artifactDir = process.env.ARTIFACT_DIR;
const profileDir = await mkdtemp(join(tmpdir(), "timeline-ia-playwright-"));
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ storageState: undefined });
const page = await context.newPage();

try {
  const response = await page.goto(targetUrl, { waitUntil: "domcontentloaded" });
  if (!response || !response.ok()) {
    throw new Error(`target returned ${response?.status() ?? "no response"}`);
  }
  if (artifactDir) {
    await mkdir(artifactDir, { recursive: true });
    await page.screenshot({ path: join(artifactDir, "smoke.png"), fullPage: true });
    await writeFile(join(artifactDir, "url.txt"), `${targetUrl}\n`, "utf8");
  }
  console.log(`Playwright smoke passed: ${targetUrl}`);
} finally {
  await context.close();
  await browser.close();
  void profileDir;
}
