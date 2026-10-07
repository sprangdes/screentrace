/** Completes WP37's export check while leaving each caller's Markdown assertions unchanged. */
export async function startReviewDownload(page) {
  const pending = page.waitForEvent('download');
  await page.getByRole('button', {name: '匯出 md', exact: true}).click();
  const check = page.locator('.pre-export-check');
  if (await check.isVisible()) await page.getByRole('button', {name: '仍要匯出', exact: true}).click();
  return pending;
}
