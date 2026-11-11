import { element } from './text';

export interface Share {
  key: string;
  count: number;
}

/**
 * A thin bar split into segments as wide as their counts, in the given order; empty segments are left out.
 * The bar is a picture of numbers shown elsewhere in words: its label says them for a screen reader and on hover,
 * and a decorative bar (inside a row that already says the numbers) is hidden from screen readers.
 */
export function proportionBar(
  shares: Share[],
  label: string,
  className: string,
  decorative = false,
): HTMLElement {
  const bar = element('span', undefined, `proportion-bar ${className}`);
  bar.title = label;
  if (decorative) bar.setAttribute('aria-hidden', 'true');
  else {
    bar.setAttribute('role', 'img');
    bar.setAttribute('aria-label', label);
  }
  for (const share of shares) {
    if (share.count <= 0) continue;
    const part = element('span', undefined, 'proportion-part');
    part.dataset.share = share.key;
    part.style.flexGrow = String(share.count);
    bar.append(part);
  }
  return bar;
}

/** A count's share of a total as a bar length: a whole percent, never below 1 for a count that is there. */
export const sharePercent = (count: number, total: number) =>
  total > 0 && count > 0 ? Math.max(1, Math.round((count / total) * 100)) : 0;
