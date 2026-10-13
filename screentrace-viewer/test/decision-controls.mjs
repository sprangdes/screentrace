// UI presentation helper: preserves the original decision values and result assertions.
// Locators name the target the old way: [data-screen-review="<screen>"] or [data-component-review="<component>"].
export async function setDecision(locator,value){
 const page=locator.page(),source=locator.toString();
 const screenId=source.match(/data-screen-review=\\?"([^"\\]+)/)?.[1],componentId=source.match(/data-component-review=\\?"([^"\\]+)/)?.[1];
 if(screenId){
  await openScreen(page,screenId);
  await page.locator(`.panel-header .decision-switch[data-screen-id="${screenId}"] [role="radio"][data-decision="${value}"]`).click();
  return;
 }
 if(componentId){
  const control=page.locator(`.decision-switch[data-component-id="${componentId}"]`).first();
  await control.locator(`[role="radio"][data-decision="${value}"]`).evaluate(button=>button.click());
  return;
 }
 await locator.first().locator(`[role="radio"][data-decision="${value}"]`).evaluate(button=>button.click());
}

export async function openScreen(page,id){
 const tab=page.locator('.page-tab[data-page="screens"]');
 if(await tab.getAttribute('aria-current')!=='page')await tab.click();
 if(await page.locator(`[data-screen-panel="${id}"]`).count())return;
 await showList(page);
 await page.locator(`.screen-list [data-screen-list="${id}"],.file-tree [data-screen-list="${id}"]`).first().click();
 await page.locator(`[data-screen-panel="${id}"]`).waitFor();
}

/** While a screen is zoomed in, the screen list is collapsed; open it the way a person would. */
export async function showList(page){
 // The list is open when docked or floating; a folding list may still be fading out but takes no input.
 if(['expanded','overlay'].includes(await page.locator('.shell').getAttribute('data-sidebar')))return;
 await page.getByRole('button',{name:'展開畫面清單'}).click();
 await page.locator('.sidebar-body').waitFor();
}
