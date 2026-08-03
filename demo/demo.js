import React from "react";
import { createRoot } from "react-dom/client";
import { Stamp } from "../dist/index.js";

const h = React.createElement;

// Two offset sheets, the usual shorthand for "copy". Stroked rather than
// filled, so the shape stays legible at 14px where a solid glyph turns into a
// blob.
const COPY_ICON = "M5.5 5.5h7v9h-7zM3.5 11.5v-10h7";
const CHECK_ICON = "M3 8.5 6.5 12 13 4.5";

/** The clipboard glyph, swapped for a tick once the copy lands. */
function CopyIcon({ copied }) {
  return h(
    "svg",
    {
      viewBox: "0 0 16 16",
      width: 15,
      height: 15,
      fill: "none",
      stroke: "currentColor",
      strokeWidth: 1.4,
      strokeLinecap: "round",
      strokeLinejoin: "round",
      "aria-hidden": "true",
    },
    h("path", { d: copied ? CHECK_ICON : COPY_ICON }),
  );
}

/**
 * A snippet with a copy button, the way GitHub presents code.
 *
 * The button is absolutely positioned over the block rather than sitting in
 * its own row, so it never pushes the code around or changes the card height.
 */
function CodeBlock({ code }) {
  const [copied, setCopied] = React.useState(false);

  React.useEffect(() => {
    if (!copied) {
      return undefined;
    }

    // Reverting on a timer, cleared on unmount so a fast re-render cannot
    // leave the tick showing on the wrong snippet.
    const timer = setTimeout(() => setCopied(false), 1600);

    return () => clearTimeout(timer);
  }, [copied]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
    } catch {
      // Clipboard access needs a secure context, so this fails on plain http
      // from anything other than localhost. Selecting the text still works.
      setCopied(false);
    }
  }

  return h(
    "div",
    { className: "code" },
    h("pre", { className: "code__pre" }, h("code", null, code)),
    h(
      "button",
      {
        type: "button",
        className: copied ? "code__copy code__copy--done" : "code__copy",
        onClick: copy,
        "aria-label": copied ? "Copied" : "Copy code",
      },
      h(CopyIcon, { copied }),
    ),
  );
}

/**
 * One example: the rendered stamp with the JSX that produced it underneath.
 *
 * The demo itself is written with `createElement` because it runs in the
 * browser without a build step, but nobody writes React that way — so the
 * snippet shown to the reader is hand-written JSX.
 */
function Example({ code, stageClassName, children }) {
  const stage = stageClassName
    ? `example__stage ${stageClassName}`
    : "example__stage";

  return h(
    "figure",
    { className: "example" },
    h("div", { className: stage }, children),
    h(CodeBlock, { code }),
  );
}

function Section({ title, note, children }) {
  return h(
    "section",
    { className: "section" },
    h("h2", null, title),
    note ? h("p", { className: "section__note" }, note) : null,
    h("div", { className: "examples" }, children),
  );
}

function Demo() {
  return h(
    React.Fragment,
    null,

    h(
      Section,
      {
        title: "Any text length",
        note: "The grain is tiled rather than stretched, so a word and a sentence wear the same way.",
      },
      h(
        Example,
        { key: "a", code: "<Stamp>Copy</Stamp>" },
        h(Stamp, null, "Copy"),
      ),
      h(
        Example,
        { key: "b", code: "<Stamp>Important</Stamp>" },
        h(Stamp, null, "Important"),
      ),
      h(
        Example,
        { key: "c", code: "<Stamp>Not for production</Stamp>" },
        h(Stamp, null, "Not for production"),
      ),
      h(
        Example,
        {
          key: "d",
          stageClassName: "example__stage--wide",
          code: "<Stamp>Confidential — do not distribute outside the organization</Stamp>",
        },
        h(
          Stamp,
          null,
          "Confidential — do not distribute outside the organization",
        ),
      ),
    ),

    h(
      Section,
      {
        title: "Distress levels",
        note: "How worn out the ink looks. Distress only controls the wear mask, so at “none” the frame and the letters simply stay sharp.",
      },
      ...["none", "light", "medium", "heavy"].map((level) =>
        h(
          Example,
          {
            key: level,
            code: `<Stamp distress="${level}">\n  Approved\n</Stamp>`,
          },
          h(Stamp, { distress: level }, "Approved"),
        ),
      ),
    ),

    h(
      Section,
      {
        title: "Speckle",
        note: "Stray flecks of ink around the text, from 0 to 4. Never escapes the frame. Defaults to a step below the distress level.",
      },
      ...[0, 1, 2, 3, 4].map((level) =>
        h(
          Example,
          {
            key: level,
            code: `<Stamp\n  speckle={${level}}\n  distress="light">\n  Received\n</Stamp>`,
          },
          h(Stamp, { speckle: level, distress: "light" }, "Received"),
        ),
      ),
    ),

    h(
      Section,
      { title: "Colors and rotation" },
      h(
        Example,
        { key: "1", code: '<Stamp color="#c62828">\n  Rejected\n</Stamp>' },
        h(Stamp, { color: "#c62828" }, "Rejected"),
      ),
      h(
        Example,
        {
          key: "2",
          code: '<Stamp\n  color="#1e6f3f"\n  rotate={6}>\n  Approved\n</Stamp>',
        },
        h(Stamp, { color: "#1e6f3f", rotate: 6 }, "Approved"),
      ),
      h(
        Example,
        {
          key: "3",
          code: '<Stamp\n  color="#2b4f9c"\n  rotate={-14}>\n  Received\n</Stamp>',
        },
        h(Stamp, { color: "#2b4f9c", rotate: -14 }, "Received"),
      ),
      h(
        Example,
        {
          key: "4",
          code: '<Stamp\n  color="#7a4b8f"\n  distress="heavy">\n  Archived\n</Stamp>',
        },
        h(
          Stamp,
          { color: "#7a4b8f", rotate: 3, distress: "heavy" },
          "Archived",
        ),
      ),
    ),

    h(
      Section,
      {
        title: "Scales with font-size",
        note: "Borders, corners and grain are sized in em, so one font-size scales the whole stamp.",
      },
      ...["44px", "22px", "12px"].map((size) =>
        h(
          Example,
          {
            key: size,
            code: `<Stamp\n  style={{ fontSize: "${size}" }}>\n  Certified\n</Stamp>`,
          },
          h(Stamp, { style: { fontSize: size } }, "Certified"),
        ),
      ),
    ),

    h(
      Section,
      {
        title: "Same seed, same pattern",
        note: "The seed defaults to the stamped text, so identical stamps look identical. Pass one explicitly to break the tie.",
      },
      h(
        Example,
        { key: "s1", code: '<Stamp seed="fixed">\n  Stable\n</Stamp>' },
        h(Stamp, { seed: "fixed" }, "Stable"),
      ),
      h(
        Example,
        { key: "s2", code: '<Stamp seed="fixed">\n  Stable\n</Stamp>' },
        h(Stamp, { seed: "fixed" }, "Stable"),
      ),
      h(
        Example,
        { key: "s3", code: '<Stamp seed="other">\n  Stable\n</Stamp>' },
        h(Stamp, { seed: "other" }, "Stable"),
      ),
    ),

    h(
      "section",
      { className: "section" },
      h("h2", null, "Over content (multiply blend)"),
      h(
        "p",
        { className: "section__note" },
        "The ink blends into the text underneath instead of covering it with an opaque box.",
      ),
      h(
        "div",
        { className: "paper" },
        h(
          "p",
          null,
          "This paragraph sits underneath the stamp so you can check that the ink blends into the ",
          "text rather than covering it with an opaque box. Scroll past it and the worn edges should ",
          "still let the words show through.",
        ),
        h(Stamp, { color: "#c62828", rotate: -6, distress: "heavy" }, "Paid"),
      ),
      h(CodeBlock, {
        code: '<Stamp color="#c62828" rotate={-6} distress="heavy">\n  Paid\n</Stamp>',
      }),
    ),
  );
}

createRoot(document.getElementById("root")).render(h(Demo));
