import { element } from './text';
import { icon, iconButton } from './shell-ui';
import { Index } from './map';
import { Payload } from './contracts';
import { PrototypeHistory } from './prototype-history';
import { rolePartition, roleTint } from './personas';

export interface PrototypeOptions {
  back: () => void;
  focus: (id: string) => void;
  move: (delta: number) => void;
  scroll: number;
  presenting: boolean;
  present: () => void;
  /** The row above the preview card: the way back, the history and the trail; filled here. */
  top: HTMLElement;
}

const ghost = (label: string, name: string) => {
  const button = iconButton(label, name);
  button.classList.add('ghost-button');
  return button;
};

/** Full-size static preview of one screen in a browser-like card, with its history row above it and zoom controls. */
export function prototypeViewer(
  index: Index,
  payload: Payload,
  id: string,
  preview: HTMLElement,
  frame: HTMLIFrameElement,
  history: PrototypeHistory,
  options: PrototypeOptions,
): HTMLElement {
  const metadata = payload.preview.screens?.find((s) => s.graphScreenId === id),
    width = Math.max(1, metadata?.width || 1440);
  let height = Math.max(1, metadata?.height || 900);
  const root = element('section', undefined, 'prototype-viewer'),
    toolbar = element('div', undefined, 'prototype-toolbar'),
    scroller = element('div', undefined, 'prototype-scroll'),
    stage = element('div', undefined, 'prototype-stage'),
    status = element('div', undefined, 'prototype-status');
  root.setAttribute('aria-label', '畫面預覽');
  status.setAttribute('role', 'status');
  const name = index.nodes.get(id)?.name || id,
    address = index.routes.get(id)?.[0] || '沒有已知 URL';
  // The history: back to the overview, then the previous／next screen seen, as quiet buttons before the trail.
  const back = ghost('返回總覽', 'back'),
    previous = ghost('上一個看過的畫面', 'chevronLeft'),
    next = ghost('下一個看過的畫面', 'chevronRight');
  back.classList.add('prototype-back');
  back.append(element('span', '返回總覽'));
  back.onclick = options.back;
  const arrows = (a: HTMLButtonElement, b: HTMLButtonElement) => {
    a.disabled = !history.canBack;
    b.disabled = !history.canForward;
    a.onclick = () => options.move(-1);
    b.onclick = () => options.move(1);
  };
  arrows(previous, next);
  // The browser bar: three dots, the address, what the page is, and the full-window button.
  const dots = element('span', undefined, 'browser-dots');
  dots.setAttribute('aria-hidden', 'true');
  dots.append(element('span'), element('span'), element('span'));
  const url = element('code', address, 'prototype-url');
  url.setAttribute('aria-label', '主要 URL');
  url.title = address;
  const present = iconButton('全螢幕預覽（f）', 'corners');
  present.classList.add('prototype-present');
  present.setAttribute('aria-pressed', String(options.presenting));
  present.onclick = options.present;
  toolbar.append(dots, url, element('span', '示意畫面 · 範例資料', 'prototype-caption'), present);
  // Full window: the same history arrows, the screen's name and address, whose screen it is, and the way out.
  const head = element('div', undefined, 'present-head'),
    fullPrevious = ghost('上一個看過的畫面', 'chevronLeft'),
    fullNext = ghost('下一個看過的畫面', 'chevronRight'),
    title = element('div', undefined, 'present-title');
  arrows(fullPrevious, fullNext);
  const arrowsBox = element('div', undefined, 'present-arrows');
  arrowsBox.setAttribute('role', 'group');
  arrowsBox.setAttribute('aria-label', '瀏覽歷程');
  arrowsBox.append(fullPrevious, fullNext);
  title.append(element('strong', name), element('code', address));
  head.append(arrowsBox, title);
  // Who uses this screen, from the roles' flows (ADR 0188).
  const roles = rolePartition(index),
    role = roles?.of.get(id);
  if (roles && role) {
    const tag = element('span', roles.label(role), 'prototype-role');
    tag.dataset.role = role;
    tag.dataset.roleTint = roleTint(index.graph, role);
    tag.title = '依角色流程判斷誰會用到這個畫面';
    head.append(tag);
  }
  const exit = element('button', undefined, 'present-exit');
  exit.type = 'button';
  exit.dataset.presentExit = 'true';
  const escape = element('kbd', 'Esc');
  escape.setAttribute('aria-hidden', 'true');
  exit.append(icon('cornersIn'), element('span', '結束全螢幕'), escape);
  exit.onclick = options.present;
  head.append(
    element('span', undefined, 'present-spacer'),
    element('div', undefined, 'present-controls'),
    exit,
  );
  // The way here, as a breadcrumb beside the back／forward arrows: the last few screens, each a step back (ADR 0189).
  const crumbs = element('nav', undefined, 'prototype-trail');
  crumbs.setAttribute('aria-label', '瀏覽歷程');
  const trail = history.trail,
    shown = trail.slice(-3);
  crumbs.append(element('span', '歷程', 'prototype-trail-label'));
  if (trail.length > shown.length) crumbs.append(element('span', '…', 'prototype-trail-sep'));
  shown.forEach((screenId, i) => {
    const step = element(
      'button',
      index.nodes.get(screenId)?.name || screenId,
      'prototype-trail-step',
    );
    step.type = 'button';
    step.dataset.trailStep = screenId;
    step.onclick = () => options.move(trail.length - shown.length + i - trail.length);
    crumbs.append(step, element('span', '›', 'prototype-trail-sep'));
  });
  crumbs.append(element('strong', name, 'prototype-trail-here'));
  const nav = element('div', undefined, 'stage-nav');
  nav.append(back, previous, next);
  options.top.replaceChildren(
    nav,
    crumbs,
    element('span', undefined, 'stage-spacer'),
    element('div', undefined, 'stage-controls'),
  );
  // Under the page: how to use it, and what the dashed outlines mean.
  const footer = element('div', undefined, 'prototype-footer'),
    legend = element('span', undefined, 'prototype-legend');
  legend.append(
    element('span', '示範資料', 'legend-key is-demo'),
    element('span', '依條件出現', 'legend-key is-conditional'),
  );
  footer.append(element('span', '點預覽中的按鈕＝模擬前往下一個畫面'), legend);
  root.append(toolbar, head, status, scroller, footer);
  frame.style.width = `${width}px`;
  frame.style.height = `${height}px`;
  frame.style.maxWidth = 'none';
  frame.scrolling = 'no';
  preview.style.width = `${width}px`;
  preview.style.height = `${height}px`;
  preview.style.transformOrigin = '0 0';
  stage.append(preview);
  scroller.append(stage);
  let scaleMode: 'fit' | 'manual' = 'fit',
    scale = 1;
  // Fit to the card's width, edge to edge.
  const fitScale = () => Math.min(1, Math.max(1, scroller.clientWidth) / width);
  const resize = () => {
    if (!root.isConnected) {
      observer.disconnect();
      contentObserver?.disconnect();
      return;
    }
    if (scaleMode === 'fit') scale = fitScale();
    preview.style.transform = `scale(${scale})`;
    preview.style.height = `${height}px`;
    frame.style.height = `${height}px`;
    stage.style.width = `${width * scale}px`;
    stage.style.height = `${height * scale}px`;
    root.dataset.scale = String(scale);
    root.dataset.zoomMode = scaleMode;
  };
  const observer = new ResizeObserver(resize);
  let contentObserver: ResizeObserver | undefined;
  observer.observe(scroller);
  const zoomControls = element('div', undefined, 'prototype-zoom-controls');
  zoomControls.setAttribute('aria-label', '畫面縮放');
  const zoomBy = (delta: number) => {
    const base = scaleMode === 'fit' ? fitScale() : scale;
    scaleMode = 'manual';
    scale = Math.min(1.5, Math.max(0.5, Math.round((base + delta) * 100) / 100));
    resize();
  };
  const minus = iconButton('縮小', 'minus'),
    plus = iconButton('放大', 'zoom'),
    fit = iconButton('適合寬度', 'fit');
  minus.onclick = () => zoomBy(-0.25);
  plus.onclick = () => zoomBy(0.25);
  fit.onclick = () => {
    scaleMode = 'fit';
    resize();
  };
  zoomControls.append(minus, plus, fit);
  frame.addEventListener('load', () => {
    if (!frame.getAttribute('srcdoc') || !frame.contentDocument) return;
    const doc = frame.contentDocument;
    let overflow: number | undefined;
    const measure = () => {
      const content = Math.max(doc.documentElement.scrollHeight, doc.body?.scrollHeight || 0),
        excess = content - doc.documentElement.clientHeight;
      // Content that outgrows the frame by the same amount after the frame grew to fit it is
      // sized by the frame (`min-height: 100vh` plus a margin): stop following it.
      if (excess > 0 && excess === overflow) {
        contentObserver?.disconnect();
        return;
      }
      overflow = excess > 0 ? excess : undefined;
      height = Math.max(metadata?.height || 900, content);
      resize();
    };
    // Pages sized in vh/dvh grow with the frame, so watching the content would enlarge it without end. With a
    // captured height the content is measured once on load; the frame never chases its own resize. Without one,
    // the frame follows the content until the content only grows with the frame.
    measure();
    if (!metadata?.height) {
      contentObserver = new ResizeObserver(measure);
      if (doc.body) contentObserver.observe(doc.body);
    }
    scroller.scrollTop = options.scroll;
    root.dataset.loaded = 'true';
  });
  if (!payload.documents[id]) status.textContent = '未取得重建預覽';
  root.append(zoomControls);
  requestAnimationFrame(resize);
  return root;
}
