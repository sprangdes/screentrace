// UI presentation helper: preserves the original decision values and result assertions.
export async function setDecision(locator,value){await locator.hover();await locator.locator(`[data-decision="${value}"]`).click();}
