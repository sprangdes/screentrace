export async function reviewExportMenuItem(page) {
  const menu=page.locator('.topbar-more');
  if(!(await menu.evaluate(element=>element.open)))await menu.locator(':scope > summary').click();
  return menu.getByRole('menuitem',{name:'匯出 md',exact:true});
}

/** Completes the export check while leaving each caller's Markdown assertions unchanged. */
export async function startReviewDownload(page) {
  const exportButton=await reviewExportMenuItem(page);
  const pending = page.waitForEvent('download');
  await exportButton.click();
  const check = page.locator('.pre-export-check');
  await check.waitFor({state:'visible'});
  await page.getByRole('button', {name: '仍要匯出', exact: true}).click();
  const failure=page.locator('[data-md-status]').filter({hasText:'匯出失敗'});
  return Promise.race([pending,failure.waitFor({state:'visible'}).then(async()=>{throw new Error(await failure.innerText());})]);
}
