import { expect, test } from "@playwright/test";
import { createE2eUserForFile } from "./create-file-user";
import { blockExternalBrowserRequests } from "./browser-network";

let user: Awaited<ReturnType<typeof createE2eUserForFile>>;
test.beforeAll(async () => { user = await createE2eUserForFile(__filename); });

test("login in the frontend establishes an Auth session and reaches the API", async ({ page }) => {
  await blockExternalBrowserRequests(page);
  await page.goto(process.env.E2E_WEB_URL!);
  await page.getByLabel("E-mail").fill(user.email);
  await page.getByLabel("Senha").fill(user.password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(new RegExp(`/${user.id}$`));
  const response = await page.evaluate(async () => {
    const result = await fetch("/api/events", { credentials: "same-origin" });
    return { status: result.status, body: await result.json() };
  });
  expect(response.status).toBe(200);
  expect(response.body).toHaveProperty("items");
});
