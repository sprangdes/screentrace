export async function reviewExportMenuItem(page) {
  const menu=page.locator('.topbar-more');
  if(!(await menu.evaluate(element=>element.open)))await menu.locator(':scope > summary').click();
  return menu.getByRole('menuitem',{name:'匯出 md',exact:true});
}

/** Starts the direct Markdown download from the delivery workflow. */
export async function startReviewDownload(page) {
  const exportButton=await reviewExportMenuItem(page),pending=page.waitForEvent('download');
  await exportButton.click();
  const failure=page.locator('[data-md-status]').filter({hasText:'匯出失敗'});
  return Promise.race([pending,failure.waitFor({state:'visible'}).then(async()=>{throw new Error(await failure.innerText());})]);
}
