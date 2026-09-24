import { expect, test, type Page } from '@playwright/test';
import { createE2eUserForFile } from './create-file-user';
import { blockExternalBrowserRequests } from './browser-network';

test.use({
  viewport: { width: 390, height: 844 },
  permissions: ['microphone'],
  launchOptions: {
    args: [
      '--use-fake-device-for-media-stream',
      '--use-fake-ui-for-media-stream',
    ],
  },
});
let user: Awaited<ReturnType<typeof createE2eUserForFile>>;
let other: Awaited<ReturnType<typeof createE2eUserForFile>>;
test.beforeAll(async () => {
  user = await createE2eUserForFile(__filename);
  other = await createE2eUserForFile(`${__filename}-other`);
});

async function login(page: Page, actor = user) {
  await blockExternalBrowserRequests(page);
  await page.goto(process.env.E2E_WEB_URL!);
  await page.getByLabel('E-mail').fill(actor.email);
  await page.getByLabel('Senha').fill(actor.password);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/${actor.id}$`));
}
async function openVoice(page: Page) {
  await login(page);
  await page
    .getByRole('button', { name: 'Buscar e criar', exact: true })
    .click();
  await page.getByRole('button', { name: 'Chat com IA', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Falar com a IA' }),
  ).toBeVisible();
}
async function record(page: Page) {
  await page.getByRole('button', { name: 'Falar com a IA' }).click();
  await expect(page.getByRole('status')).toHaveText('Gravando');
  await expect(page.getByLabel('Duração da gravação')).toContainText('0:01');
  await page.getByRole('button', { name: 'Parar gravação' }).click();
}

test('binary recording crosses Web → Auth → API → worker and submits exactly one chat message', async ({
  page,
  browser,
}) => {
  await openVoice(page);
  const upload = page.waitForRequest(
    (request) =>
      request.method() === 'POST' &&
      request.url().endsWith('/api/audio/transcriptions'),
  );
  await record(page);
  const request = await upload;
  const id = request.headers()['x-recording-id'];
  expect(request.postDataBuffer()!.length).toBeGreaterThan(100);
  await expect(
    page
      .getByRole('log')
      .getByText('não, não, amanhã às nove', { exact: true }),
  ).toHaveCount(1);
  await expect(page.getByRole('log')).toContainText('A IA está indisponível');
  // Another real Auth user cannot read this recording's result.
  const context = await browser.newContext();
  const otherPage = await context.newPage();
  await login(otherPage, other);
  const status = await otherPage.evaluate(
    async (recordingId) =>
      (await fetch(`/api/audio/transcriptions/${recordingId}`)).status,
    id,
  );
  expect(status).toBe(404);
  await context.close();
});

test('network retry reuses the recording and cancelling drops late results', async ({
  page,
}) => {
  await openVoice(page);
  const ids: string[] = [];
  await page.route('**/api/audio/transcriptions', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    ids.push(route.request().headers()['x-recording-id']);
    if (ids.length === 1) return route.abort('failed');
    await route.continue();
  });
  await record(page);
  await page
    .getByRole('button', { name: 'Tentar transcrever novamente' })
    .click();
  await expect(page.getByRole('status')).toHaveText('Transcrevendo…');
  await expect.poll(() => ids.length).toBe(2);
  await page.getByRole('button', { name: 'Cancelar gravação' }).click();
  expect(ids[1]).toBe(ids[0]);
  await expect(page.getByRole('log')).toHaveCount(0);
  await expect
    .poll(async () =>
      page.evaluate(async (id) => {
        const response = await fetch(`/api/audio/transcriptions/${id}`);
        return (await response.json()).status;
      }, ids[0]),
    )
    .toBe('cancelled');
  await expect(page.getByRole('log')).toHaveCount(0);
});

test('silence never becomes an automatic message', async ({ page }) => {
  await openVoice(page);
  await page.getByRole('button', { name: 'Falar com a IA' }).click();
  await expect(page.getByRole('status')).toHaveText('Gravando');
  await page.waitForTimeout(150); // Produce a decodable short recording for the inference fake.
  await page.getByRole('button', { name: 'Parar gravação' }).click();
  await expect(page.getByRole('alert')).toContainText('Não identifiquei fala');
  await expect(page.getByRole('log')).toHaveCount(0);
});
