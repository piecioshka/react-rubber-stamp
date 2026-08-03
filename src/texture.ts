/**
 * Grunge texture generation.
 *
 * Two effects live here, both emitted as SVG data URIs generated at runtime
 * rather than shipped as binary assets:
 *
 * - the wear mask, which *removes* ink with an `feTurbulence` filter, and
 * - the speckle mask, which *adds* stray flecks around the text.
 *
 * Both are deterministic in the `seed` prop, so server and client renders
 * produce identical markup, and both tile at {@link TEXTURE_TILE_SIZE} so the
 * grain looks the same at any text length.
 */

/**
 * Deterministic 32-bit hash, used to turn a string seed into the numeric seed
 * that `feTurbulence` expects.
 */
export function hashSeed(seed: string | number): number {
  if (typeof seed === "number") {
    return Math.abs(Math.trunc(seed)) % 10000;
  }

  let hash = 0;

  for (let i = 0; i < seed.length; i++) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }

  return Math.abs(hash) % 10000;
}

/**
 * How aggressively the ink is eaten away.
 *
 * The turbulence output is pushed through a `feComponentTransfer` whose table
 * decides which noise values survive as opaque ink. Higher distress means more
 * of the surface is cut away.
 */
export type Distress = "none" | "light" | "medium" | "heavy";

// Calibrated by eye against rendered output. Two failure modes bound this:
// too much cut away and the text turns into an unreadable ghost, too little
// and the stamp is indistinguishable from a plain bordered badge. These values
// keep the wear visible while every level stays legible.
//
// `discrete` maps the noise into buckets, so a run of equal values produces
// flat patches of surviving ink rather than a smooth gradient — that hard
// edge between kept and cut ink is what reads as a dried-out pad.
const DISTRESS_TABLE: Record<Distress, string> = {
  none: "1 1",
  light: "1 1 1 1 0.92 0.7",
  medium: "1 1 1 0.9 0.62 0.35",
  heavy: "1 1 0.9 0.65 0.35 0.12",
};

// Higher frequency breaks the ink into finer speckles; lower leaves broader
// patches, which reads as a heavier, blotchier press. Real stamps carry both
// at once, so each level mixes a coarse blotch frequency with a fine speckle
// one (the Y frequency is deliberately higher — a stamp is rocked side to
// side as it lands, which smears wear along the horizontal).
// The grain has to stay finer than a letter stroke. Too coarse and a patch of
// noise swallows a whole glyph instead of nibbling its edge, which is what
// turned "HEAVY" into an unreadable smudge at the first attempt.
const DISTRESS_FREQUENCY: Record<Distress, string> = {
  none: "0",
  light: "0.16 0.3",
  medium: "0.2 0.38",
  heavy: "0.24 0.46",
};

// Long scratches carved by the worn edges of the rubber. Without these the
// wear looks like uniform sandpaper; a few directional streaks are what make
// it read as a physical object that has been pressed many times.
const SCRATCH_OPACITY: Record<Distress, number> = {
  none: 0,
  light: 0.18,
  medium: 0.3,
  heavy: 0.45,
};

// The mask is tiled at its natural size rather than stretched to fit, so the
// grain stays the same on a short "BETA" and a long sentence. A stretched mask
// smears the noise into horizontal streaks on wide stamps.
export const TEXTURE_TILE_SIZE = 300;

/**
 * Builds the `mask-image` value applying the worn-out effect.
 *
 * The SVG paints an opaque white rectangle and then knocks holes into its alpha
 * channel with fractal noise. White stays, transparent disappears — which is
 * exactly what a CSS mask consumes.
 */
export function buildTextureMask(
  distress: Distress,
  seed: string | number,
): string | undefined {
  if (distress === "none") {
    return undefined;
  }

  const numericSeed = hashSeed(seed);
  const frequency = DISTRESS_FREQUENCY[distress];
  const table = DISTRESS_TABLE[distress];
  const scratchOpacity = SCRATCH_OPACITY[distress];
  const size = TEXTURE_TILE_SIZE;

  // Offsetting the scratch seed keeps the streaks from lining up with the
  // blotches they are drawn over — two independent patterns read as two
  // separate causes of wear.
  const scratchSeed = (numericSeed + 977) % 10000;

  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">`,

    // Blotchy wear: broad patches of ink lifted off the paper.
    `<filter id="g" x="0" y="0" width="100%" height="100%">`,
    `<feTurbulence type="fractalNoise" baseFrequency="${frequency}" numOctaves="5" seed="${numericSeed}" result="noise"/>`,
    `<feComponentTransfer in="noise">`,
    `<feFuncA type="discrete" tableValues="${table}"/>`,
    `</feComponentTransfer>`,
    `</filter>`,

    // Scratches: turbulence squashed along one axis, which stretches the noise
    // into streaks running across the face of the stamp.
    `<filter id="s" x="0" y="0" width="100%" height="100%">`,
    `<feTurbulence type="fractalNoise" baseFrequency="0.7 0.015" numOctaves="2" seed="${scratchSeed}" result="streaks"/>`,
    `<feComponentTransfer in="streaks">`,
    `<feFuncA type="discrete" tableValues="0 0 0 0 0 0 1"/>`,
    `</feComponentTransfer>`,
    `</filter>`,

    `<rect width="${size}" height="${size}" fill="#fff" filter="url(#g)"/>`,
    `<rect width="${size}" height="${size}" fill="#000" filter="url(#s)" opacity="${scratchOpacity}"/>`,
    `</svg>`,
  ].join("");

  return `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`;
}

/**
 * How much stray ink is flicked around the text, from `0` (a clean press) to
 * `4` (a pad that spatters).
 *
 * A stamp pressed by hand never deposits ink only where the letters are — the
 * pad leaves scattered dots across the whole face. This is drawn separately
 * from the wear mask because it *adds* ink rather than removing it.
 *
 * Numbered rather than named because five steps of the same thing have no
 * natural names — "light/medium/heavy" runs out after three.
 */
export type Speckle = 0 | 1 | 2 | 3 | 4;

/** Every speckle step, weakest first. Handy for demos and prop validation. */
export const SPECKLE_LEVELS: readonly Speckle[] = [0, 1, 2, 3, 4];

// How many dots land inside the tile. Splatter has to be dense to read as
// splatter — an early pass used a couple of dozen and they looked like blobs
// someone had placed on purpose. Counts roughly double per step rather than
// climbing evenly, because dot density reads logarithmically: an even ramp
// left neighbouring levels impossible to tell apart side by side.
const SPECKLE_COUNT: Record<Speckle, number> = {
  0: 0,
  1: 60,
  2: 160,
  3: 380,
  4: 800,
};

// Radii as a fraction of the tile, so the dots scale with the type like
// everything else. These are deliberately tiny: a fleck of stray ink is much
// smaller than a letter stroke, and anything larger reads as a stain.
const SPECKLE_RADIUS: Record<Speckle, { min: number; max: number }> = {
  0: { min: 0, max: 0 },
  1: { min: 0.001, max: 0.003 },
  2: { min: 0.0011, max: 0.0045 },
  3: { min: 0.0013, max: 0.006 },
  4: { min: 0.0015, max: 0.008 },
};

// Strongest opacity per level. The faintest dots stay faint at every level —
// widening the top of the range is what makes a heavy splatter read as wetter
// ink rather than just more of the same dust.
const SPECKLE_OPACITY: Record<Speckle, number> = {
  0: 0,
  1: 0.5,
  2: 0.65,
  3: 0.8,
  4: 0.95,
};

/**
 * Deterministic pseudo-random sequence.
 *
 * `Math.random` would give every render a different splatter, so the server
 * and client markup would disagree and React would warn about it. A mulberry32
 * generator seeded from the `seed` prop keeps the pattern reproducible while
 * still looking scattered.
 */
function createRandom(seed: number): () => number {
  let state = seed >>> 0;

  return function next(): number {
    state = (state + 0x6d2b79f5) >>> 0;

    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);

    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Builds the `mask-image` value carrying the ink splatter.
 *
 * This is a mask rather than a background because `currentColor` does not
 * resolve inside a data URI — the SVG is a separate document and never sees
 * the stamp's `color`, so painting the dots directly would render them black
 * on every non-black stamp. Masking a `currentColor` layer instead lets the
 * dots follow the ink color for free.
 */
export function buildSpeckleMask(
  speckle: Speckle,
  seed: string | number,
): string | undefined {
  if (speckle === 0) {
    return undefined;
  }

  // Offset from the wear seed so the dots do not cluster into the same spots
  // the blotches already ate away.
  const random = createRandom(hashSeed(seed) + 4271);
  const count = SPECKLE_COUNT[speckle];
  const { min, max } = SPECKLE_RADIUS[speckle];
  const maxOpacity = SPECKLE_OPACITY[speckle];
  const size = TEXTURE_TILE_SIZE;

  const dots: string[] = [];

  for (let i = 0; i < count; i++) {
    const cx = (random() * size).toFixed(1);
    const cy = (random() * size).toFixed(1);
    // Biased small: squaring pushes most of the distribution toward the
    // minimum, so a field of fine dust carries a few larger flecks rather than
    // every dot landing at an average middling size.
    const spread = random() * random();
    const r = ((min + spread * (max - min)) * size).toFixed(2);
    // Varying opacity reads as dots pressed with different amounts of ink.
    // In a mask only the alpha channel counts, so the fill is always white and
    // the strength comes from opacity alone.
    const dotOpacity = (0.18 + random() * (maxOpacity - 0.18)).toFixed(2);

    dots.push(
      `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#fff" opacity="${dotOpacity}"/>`,
    );
  }

  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">`,
    ...dots,
    `</svg>`,
  ].join("");

  return `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`;
}
