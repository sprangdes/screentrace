import { element } from './text';

/**
 * Copies a source location to the clipboard and says so briefly on the node. Without the clipboard API
 * (a file:// page may not have it), the text is selected in a hidden field and copied with execCommand.
 */
export function copySource(text: string, node: HTMLElement): void {
  const done = () => {
    node.querySelector('.api-copied')?.remove();
    const tag = element('span', '已複製', 'api-copied');
    tag.setAttribute('role', 'status');
    node.append(tag);
    setTimeout(() => tag.remove(), 1400);
  };
  const fallback = () => {
    const field = element('textarea');
    field.value = text;
    field.setAttribute('readonly', '');
    field.style.position = 'fixed';
    field.style.opacity = '0';
    document.body.append(field);
    field.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    field.remove();
    if (ok) done();
    else window.prompt('複製原始碼位置', text);
  };
  if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(done, fallback);
  else fallback();
}
