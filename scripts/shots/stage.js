/*
 * The screenshot stage.
 *
 * Each entry in SHOTS renders one README image. The capture script asks for a
 * shot by name (`?shot=hero`), waits for the fonts to settle, and crops to the
 * `.shot` element — so what you see here is exactly what lands in the PNG.
 *
 * Keep the shots aligned with the alt text in README.md: the alt describes the
 * words on the stamps, so changing one without the other makes the docs lie.
 */
import React from "react";
import { createRoot } from "react-dom/client";
import { Stamp } from "../../dist/index.js";

const h = React.createElement;

/** A stamp under a small caption, for shots comparing one setting. */
function Labelled({ label, children }) {
  return h(
    "div",
    { className: "item" },
    children,
    h("span", { className: "item__label" }, label),
  );
}

const SHOTS = {
  // README hero. Two stamps, deliberately different in colour and angle, to
  // show the range without needing a caption.
  hero: () => [
    h(Stamp, { key: "a", rotate: -4 }, "Certified"),
    h(Stamp, { key: "b", color: "#1e6f3f", rotate: 5 }, "Approved"),
  ],

  // "Any text length" — one word through to a full sentence, stacked so the
  // longest line does not squash the short ones.
  lengths: {
    className: "shot--stacked",
    render: () => [
      h(Stamp, { key: "a" }, "Copy"),
      h(Stamp, { key: "b" }, "Important"),
      h(Stamp, { key: "c" }, "Not for production"),
      h(
        Stamp,
        { key: "d" },
        "Confidential — do not distribute outside the organization",
      ),
    ],
  },

  // The four distress levels, left to right, sharp to worn.
  distress: {
    className: "shot--labelled",
    render: () =>
      ["none", "light", "medium", "heavy"].map((level) =>
        h(
          Labelled,
          { key: level, label: level },
          h(Stamp, { distress: level }, "Approved"),
        ),
      ),
  },

  // Speckle 0 to 4. Distress is pinned to "light" so the only thing changing
  // between the five stamps is the fleck count.
  speckle: {
    className: "shot--labelled",
    render: () =>
      [0, 1, 2, 3, 4].map((level) =>
        h(
          Labelled,
          { key: level, label: String(level) },
          h(Stamp, { speckle: level, distress: "light" }, "Received"),
        ),
      ),
  },

  // Colours and rotation together — each stamp carries both a hue and an angle.
  colors: () => [
    h(Stamp, { key: "1", color: "#c62828", rotate: -6 }, "Rejected"),
    h(Stamp, { key: "2", color: "#1e6f3f", rotate: 6 }, "Approved"),
    h(Stamp, { key: "3", color: "#2b4f9c", rotate: -14 }, "Received"),
    h(
      Stamp,
      { key: "4", color: "#7a4b8f", rotate: 3, distress: "heavy" },
      "Archived",
    ),
  ],

  // One stamp at three font sizes, proving the grain tracks the type.
  scale: {
    className: "shot--scale",
    render: () =>
      ["44px", "22px", "12px"].map((size) =>
        h(Stamp, { key: size, style: { fontSize: size } }, "Certified"),
      ),
  },
};

const name = new URLSearchParams(location.search).get("shot");
const shot = SHOTS[name];

if (!shot) {
  throw new Error(
    `Unknown shot "${name}". Known shots: ${Object.keys(SHOTS).join(", ")}`,
  );
}

const { className = "", render } =
  typeof shot === "function" ? { render: shot } : shot;

createRoot(document.getElementById("root")).render(
  h("div", { className: `shot ${className}`.trim() }, render()),
);
