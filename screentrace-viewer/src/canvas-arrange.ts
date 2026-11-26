import { Position } from './map';
import { CARD } from './overview';

/** Geometry for cards the person moved by hand on the overview (free arrangement). */
export type Box = { x: number; y: number; width: number; height: number };
export type Arrangement = Record<string, { x: number; y: number }>;

const STUB = 24;

/**
 * An orthogonal line between two cards at arbitrary places, used once one of them was moved by hand (the overview's
 * router only knows its own layered grid). Side by side, the line leaves the facing sides and turns once halfway;
 * stacked, it leaves the bottom or top; overlapping cards get a straight line between their centres. offset keeps
 * the two directions of a pair apart.
 */
export function cardRoute(a: Position, b: Position, offset = 0): Position[] {
  const w = CARD.width,
    h = CARD.height,
    ac = { x: a.x + w / 2, y: a.y + h / 2 },
    bc = { x: b.x + w / 2, y: b.y + h / 2 };
  const gapX = Math.max(b.x - (a.x + w), a.x - (b.x + w)),
    gapY = Math.max(b.y - (a.y + h), a.y - (b.y + h));
  if (gapX > 0 && gapX >= gapY) {
    const right = b.x > a.x,
      sx = right ? a.x + w : a.x,
      ex = right ? b.x : b.x + w,
      sy = ac.y + offset,
      ey = bc.y + offset,
      mx = (sx + ex) / 2 + offset;
    return Math.abs(sy - ey) < 1
      ? [
          { x: sx, y: sy },
          { x: ex, y: ey },
        ]
      : [
          { x: sx, y: sy },
          { x: mx, y: sy },
          { x: mx, y: ey },
          { x: ex, y: ey },
        ];
  }
  if (gapY > 0) {
    const down = b.y > a.y,
      sy = down ? a.y + h : a.y,
      ey = down ? b.y : b.y + h,
      sx = ac.x + offset,
      ex = bc.x + offset,
      my = (sy + ey) / 2 + offset;
    return Math.abs(sx - ex) < 1
      ? [
          { x: sx, y: sy },
          { x: ex, y: ey },
        ]
      : [
          { x: sx, y: sy },
          { x: sx, y: my },
          { x: ex, y: my },
          { x: ex, y: ey },
        ];
  }
  return [ac, bc];
}

/** A screen that leads to itself: a small loop out of its right side and back into its bottom. */
export function loopRoute(a: Position): Position[] {
  const w = CARD.width,
    h = CARD.height;
  return [
    { x: a.x + w, y: a.y + h * 0.7 },
    { x: a.x + w + STUB, y: a.y + h * 0.7 },
    { x: a.x + w + STUB, y: a.y + h + STUB },
    { x: a.x + w * 0.7, y: a.y + h + STUB },
    { x: a.x + w * 0.7, y: a.y + h },
  ];
}

/** The box around the given cards, or undefined when none has a position. */
export function cardsBox(
  positions: Map<string, Position>,
  ids: readonly string[],
): Box | undefined {
  const shown = ids.map((id) => positions.get(id)).filter((p): p is Position => !!p);
  if (!shown.length) return undefined;
  const left = Math.min(...shown.map((p) => p.x)),
    top = Math.min(...shown.map((p) => p.y)),
    right = Math.max(...shown.map((p) => p.x + CARD.width)),
    bottom = Math.max(...shown.map((p) => p.y + CARD.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

/**
 * An area frame that follows its cards: the computed frame keeps the same margins (and its title band) around the
 * cards' box wherever they were moved, so an untouched area keeps exactly its computed frame.
 */
export function followFrame(base: Box, baseCards: Box, cards: Box): Box {
  return {
    x: cards.x - (baseCards.x - base.x),
    y: cards.y - (baseCards.y - base.y),
    width: cards.width + (base.width - baseCards.width),
    height: cards.height + (base.height - baseCards.height),
  };
}

export const sameBox = (a: Box, b: Box) =>
  a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;

export function sameArrangement(a: Arrangement, b: Arrangement): boolean {
  const keys = Object.keys(a);
  return (
    keys.length === Object.keys(b).length &&
    keys.every((id) => b[id] && b[id].x === a[id].x && b[id].y === a[id].y)
  );
}

export const intersects = (a: Box, b: Box) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
