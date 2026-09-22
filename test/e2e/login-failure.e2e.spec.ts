import { expect, test } from "@playwright/test";
import { blockExternalBrowserRequests } from "./browser-network";
import { createE2eUserForFile } from "./create-file-user";

let user: Awaited<ReturnType<typeof createE2eUserForFile>>;
test.beforeAll(async () => { user = await createE2eUserForFile(__filename); });

test("bad credentials stay on login and do not create a browser session", async ({ page }) => {
  await blockExternalBrowserRequests(page);
  await page.goto(process.env.E2E_WEB_URL!);
  await page.getByLabel("E-mail").fill(user.email);
  await page.getByLabel("Senha").fill("incorrect-password");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByText("E-mail ou senha incorretos.", { exact: true })).toBeVisible();
  await expect(page).toHaveURL(process.env.E2E_WEB_URL! + "/");
  const status = await page.evaluate(async () => (await fetch("/api/session")).status);
  expect(status).toBe(401);
});
