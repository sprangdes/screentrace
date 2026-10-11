/** Starts the Markdown download from the top bar. */
export async function startReviewDownload(page) {
  const pending=page.waitForEvent('download');
  await page.locator('[data-md-export]').click();
  const failure=page.locator('.save-status').filter({hasText:'下載失敗'});
  return Promise.race([pending,failure.waitFor({state:'visible'}).then(async()=>{throw new Error(await failure.innerText());})]);
}
