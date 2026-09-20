import type { Page } from "@playwright/test";

export async function blockExternalBrowserRequests(page: Page): Promise<void> {
  const frontendOrigin = new URL(process.env.E2E_WEB_URL!).origin;
  await page.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (url.origin === frontendOrigin) return route.continue();
    return route.abort("blockedbyclient");
  });
}
