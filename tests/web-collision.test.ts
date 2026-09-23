/**
 * Where a drop lands in the layout editor (web/src/collision.ts). Regression cover for: letting go
 * of a dragged chip in empty space fell back to the *nearest* target, which moved the chip to the
 * closest line instead of cancelling the drag.
 */
import { describe, expect, test } from "bun:test";
import { collision, TRAY_DROP_ID } from "../web/src/collision";

// Types come from the function itself: @dnd-kit lives in web/node_modules, which the root typecheck can't see.
type Args = Parameters<typeof collision>[0];
type Rect = Args["collisionRect"];
const rect = (left: number, top: number, width: number, height: number): Rect => ({ left, top, width, height, right: left + width, bottom: top + height });

// One line with a chip in its left zone and an empty right zone, the tray below.
const rects = new Map<string, Rect>([
  ["zone:0:left", rect(0, 0, 600, 40)],
  ["zone:0:right", rect(600, 0, 400, 40)],
  ["git.branch#0", rect(10, 6, 100, 28)],
  [TRAY_DROP_ID, rect(0, 200, 1000, 120)],
]);

function at(x: number, y: number): string[] {
  const args = {
    active: { id: "git.branch#0", data: { current: undefined }, rect: { current: { initial: null, translated: null } } },
    collisionRect: rect(x - 50, y - 14, 100, 28),
    droppableRects: rects,
    droppableContainers: [...rects.keys()].map((id) => ({ id, key: id, data: { current: undefined }, disabled: false, node: { current: null }, rect: { current: rects.get(id)! } })),
    pointerCoordinates: { x, y },
  };
  // The fixture only fills the fields the collision code reads.
  return collision(args as unknown as Args).map((c) => String(c.id));
}

describe("drop target", () => {
  test("a chip under the pointer wins over the zone it sits in", () => {
    expect(at(50, 20)[0]).toBe("git.branch#0");
  });

  test("an empty part of a zone targets the zone", () => {
    expect(at(800, 20)).toEqual(["zone:0:right"]);
  });

  test("the tray is a target only while the pointer is over it", () => {
    expect(at(500, 250)).toEqual([TRAY_DROP_ID]);
  });

  test("letting go in empty space is no target at all, so the drag is cancelled", () => {
    // Between the line and the tray, and far off to the side: nothing under the pointer.
    expect(at(500, 120)).toEqual([]);
    expect(at(1400, 20)).toEqual([]);
  });
});
