/**
 * Style injection.
 *
 * The package ships zero CSS files — importing the component is enough. The
 * stylesheet is appended to `<head>` once, on the first render of the first
 * stamp, and every visual knob is exposed as a custom property so consumers can
 * still override anything from their own CSS.
 */

export const STYLE_ELEMENT_ID = "react-rubber-stamp-styles";

export const CSS = `
.react-rubber-stamp {
  --rrs-color: #c62828;
  /* Sized in em so the frame keeps its weight relative to the type — a 2px
     rule around 60px letters reads as a hairline box, not a stamp. */
  --rrs-border-width: 0.16em;
  --rrs-border-style: solid;
  /* Slightly uneven corners — a real stamp never lands as a perfect rectangle. */
  --rrs-radius: 0.28em 0.16em 0.34em 0.11em;
  --rrs-padding: 0.3em 0.85em;
  --rrs-font-size: 1em;
  /* Condensed grotesques first: a stamp is cut from a heavy, tightly-set face,
     and the generic families keep the fallback from landing on something thin. */
  --rrs-font-family: "Haettenschweiler", "Arial Narrow Bold", "Impact",
    "Franklin Gothic Bold", "Helvetica Neue", Arial, sans-serif;
  --rrs-font-weight: 800;
  --rrs-letter-spacing: 0.06em;
  --rrs-opacity: 0.85;
  --rrs-blend-mode: multiply;
  --rrs-rotate: -8deg;
  /* Squeezing the glyphs horizontally mimics a condensed cut on the fallback
     faces, which are all wider than the real thing. */
  --rrs-font-stretch: 88%;
  /* Sized in em, so the grain scales with the type. A pixel tile makes a large
     stamp look sand-blasted and a small one look chewed through. */
  --rrs-tile-size: 13em;

  position: relative;
  display: inline-block;
  box-sizing: border-box;
  color: var(--rrs-color);
  border: var(--rrs-border-width) var(--rrs-border-style) currentColor;
  border-radius: var(--rrs-radius);
  padding: var(--rrs-padding);
  font-family: var(--rrs-font-family);
  font-size: var(--rrs-font-size);
  font-weight: var(--rrs-font-weight);
  font-stretch: condensed;
  letter-spacing: var(--rrs-letter-spacing);
  line-height: 1.15;
  text-transform: uppercase;
  white-space: nowrap;
  opacity: var(--rrs-opacity);
  mix-blend-mode: var(--rrs-blend-mode);
  transform: rotate(var(--rrs-rotate)) scaleX(var(--rrs-font-stretch));
  transform-origin: center;
  user-select: none;
  /* Tiled at its natural size instead of stretched, so a long sentence carries
     the same grain as a short word. */
  -webkit-mask-size: var(--rrs-tile-size) var(--rrs-tile-size);
  mask-size: var(--rrs-tile-size) var(--rrs-tile-size);
  -webkit-mask-repeat: repeat;
  mask-repeat: repeat;
}

/* Flecks of stray ink around the text. Painted as a currentColor layer that the
   dot mask cuts holes in, because currentColor does not resolve inside a data
   URI — drawing the dots in the SVG itself would make them black on a
   non-black stamp.

   Clipped to the padding box so a fleck never escapes past the frame: the
   element already carries the border radius, and border-box clipping would let
   dots sit on top of the frame line itself. */
.react-rubber-stamp--speckled::after {
  content: "";
  position: absolute;
  inset: 0;
  background-color: currentColor;
  border-radius: inherit;
  -webkit-mask-image: var(--rrs-speckle-mask);
  mask-image: var(--rrs-speckle-mask);
  -webkit-mask-size: var(--rrs-tile-size) var(--rrs-tile-size);
  mask-size: var(--rrs-tile-size) var(--rrs-tile-size);
  -webkit-mask-repeat: repeat;
  mask-repeat: repeat;
  pointer-events: none;
}

.react-rubber-stamp--wrap {
  white-space: normal;
}
`;

let injected = false;

/**
 * Appends the stylesheet to `<head>` exactly once per document.
 *
 * Safe to call during SSR — without a `document` it simply does nothing, and
 * the client picks it up on hydration.
 */
export function injectStyles(): void {
  if (injected || typeof document === "undefined") {
    return;
  }

  if (document.getElementById(STYLE_ELEMENT_ID)) {
    injected = true;
    return;
  }

  const style = document.createElement("style");
  style.id = STYLE_ELEMENT_ID;
  style.textContent = CSS;
  document.head.appendChild(style);

  injected = true;
}

/** Test seam: forget that styles were already injected. */
export function resetStylesForTesting(): void {
  injected = false;
  document.getElementById(STYLE_ELEMENT_ID)?.remove();
}
