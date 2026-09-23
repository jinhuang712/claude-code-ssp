/**
 * Where a dragged widget would land, for the layout editor's DndContext. A pure function of the
 * pointer and the droppable rectangles, kept apart from the components so it can be unit-tested
 * (tests/web-collision.test.ts).
 */
import { pointerWithin, type CollisionDetection } from "@dnd-kit/core";

/** Drag ids for tray items are prefixed so the layout can tell "add this" from "move this chip". */
export const TRAY_PREFIX = "tray:";
/** The tray itself is a drop target: a chip dropped on it is removed from the statusline. */
export const TRAY_DROP_ID = "tray";
/** Zones are droppable too (`zone:<line>:<zone>`), so a chip can be dropped into an empty one. */
export const ZONE_PREFIX = "zone:";

/**
 * Only what is under the pointer counts: a chip (or the tray) first, then a zone. Letting go
 * anywhere else — between rows, over the page, outside the window — is no target at all, so the
 * drag is cancelled and nothing moves. It used to fall back to the *nearest* target, which quietly
 * moved a chip to whatever line happened to be closest (and, once the tray existed, could have
 * resolved a stray drop to "remove").
 */
export const collision: CollisionDetection = (args) => {
  const within = pointerWithin(args);
  const targets = within.filter((c) => !String(c.id).startsWith(ZONE_PREFIX));
  return targets.length ? targets : within;
};
