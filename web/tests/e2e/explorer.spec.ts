import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

test('navigates across the supported analysis pages', async ({ page }, testInfo) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1, name: 'Contratos Xunta' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Comeza por unha pregunta' })).toBeVisible();

    const navigation = page.locator('.primary-nav');
    await navigation.getByRole('link', { name: 'Adxudicatarios' }).click();
    await expect(page).toHaveURL(/\/adjudicatarios\/?$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Quen recibe máis e canto concentra' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Adxudicatarios' })).toBeVisible();

    await navigation.getByRole('link', { name: 'Organismos' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Que organismos contratan máis' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Organismos contratantes' })).toBeVisible();

    await navigation.getByRole('link', { name: 'Importes' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Como se distribúen os importes' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Distribución de importes' })).toBeVisible();

    await navigation.getByRole('link', { name: 'Evolución' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Cambios de ritmo e meses atípicos' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Evolución das publicacións' })).toBeVisible();

    await page.locator('.organism-multiselect summary').click();
    const organismGroup = page.getByRole('group', { name: 'Organismo da análise' });
    await organismGroup.getByRole('checkbox', { name: 'Consellería de Sanidade', exact: true }).check();
    await organismGroup.getByRole('checkbox', { name: 'Consellería de Política Social e Igualdade', exact: true }).check();
    await expect(page.locator('.organism-multiselect summary')).toHaveText('2 organismos seleccionados');
    await expect(page).toHaveURL(/organisms=11%2C513/);
    await navigation.getByRole('link', { name: 'Importes' }).click();
    await expect(page.locator('.organism-multiselect summary')).toHaveText('2 organismos seleccionados');
    await expect(page).toHaveURL(/organisms=11%2C513/);

    const hasHorizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(hasHorizontalOverflow).toBe(false);
    await page.screenshot({ path: `test-results/navigation-${testInfo.project.name}.png`, fullPage: true });
});

test('filters, exports, translates, and opens methodology', async ({ page }) => {
    await page.goto('/explorador');
    await expect(page.getByRole('heading', { level: 1, name: 'Buscar nos contratos publicados' })).toBeVisible();
    await expect(page.locator('tbody tr')).toHaveCount(20);
    await expect(page.getByRole('combobox', { name: 'Ano', exact: true })).toHaveValue('2026');
    await expect(page.getByRole('combobox', { name: 'Mes', exact: true })).toHaveValue('2026-08');
    await expect(page.locator('tbody .source-cell a').first()).toHaveAttribute(
      'href',
      /^https:\/\/www\.contratosdegalicia\.gal\/licitacion\?N=\d+$/,
    );

    const organismName = (await page.locator('tbody tr').first().locator('.organism-cell').textContent())?.trim();
    expect(organismName).toBeTruthy();
    const search = page.getByRole('searchbox');
    await search.fill(organismName!);
    await expect(page.locator('tbody')).toContainText(organismName!);

    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Descargar CSV' }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe('contratos-xunta-2026-08.csv');
    const downloadPath = await download.path();
    expect(downloadPath).not.toBeNull();
    const csv = await readFile(downloadPath!, 'utf-8');
    expect(csv).toContain(organismName!);

    await page.getByRole('button', { name: 'ES', exact: true }).click();
    await expect(page).toHaveURL(/lang=es/);
    await expect(page.getByRole('heading', { level: 1, name: 'Buscar en los contratos publicados' })).toBeVisible();
    await expect(page.getByRole('searchbox')).toHaveValue(organismName!);

    await page.locator('.primary-nav').getByRole('link', { name: 'Metodología' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Cómo se construye esta lectura' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Metodología y calidad' })).toBeVisible();
    await expect(page.getByText('No se infieren licitadores, competencia ni procedimiento', { exact: false })).toBeVisible();
});