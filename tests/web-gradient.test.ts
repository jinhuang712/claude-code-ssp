/**
 * The Style panel draws the gradient mode's swatch with its own copy of the colour stops
 * (web/src/colors.ts can't import the engine). The swatch must show what the statusline prints.
 */
import { expect, test } from "bun:test";
import { gradient } from "../src/core/api.ts";
import { gradientColor } from "../web/src/colors";

test("the panel's gradient matches the statusline's at every percentage", () => {
  const diff = Array.from({ length: 101 }, (_, p) => p).filter((p) => gradientColor(p) !== gradient(p));
  expect(diff).toEqual([]);
});
