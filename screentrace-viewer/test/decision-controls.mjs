// UI presentation helper: preserves the original decision values and result assertions.
export async function setDecision(locator,value){const control=locator.first();await control.hover();await control.locator(`[role="radio"][data-decision="${value}"]`).click();}
