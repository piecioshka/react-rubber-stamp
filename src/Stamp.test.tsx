import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { Stamp } from "./Stamp";
import { CSS, STYLE_ELEMENT_ID, resetStylesForTesting } from "./styles";
import {
  hashSeed,
  buildTextureMask,
  buildSpeckleMask,
  SPECKLE_LEVELS,
  TEXTURE_TILE_SIZE,
  type Distress,
  type Speckle,
} from "./texture";

describe("Stamp", () => {
  beforeEach(() => {
    resetStylesForTesting();
  });

  it("renders the text it is given", () => {
    render(<Stamp>Beta</Stamp>);

    expect(screen.getByText("Beta")).toBeDefined();
  });

  it("handles text of any length on a single line", () => {
    const long = "Confidential — do not distribute outside the organization";
    render(<Stamp>{long}</Stamp>);

    expect(screen.getByText(long)).toBeDefined();
  });

  it("injects the stylesheet once, no matter how many stamps render", () => {
    render(
      <>
        <Stamp>One</Stamp>
        <Stamp>Two</Stamp>
        <Stamp>Three</Stamp>
      </>,
    );

    expect(document.querySelectorAll(`#${STYLE_ELEMENT_ID}`)).toHaveLength(1);
  });

  it("maps props onto custom properties", () => {
    render(
      <Stamp color="rebeccapurple" rotate={-15} opacity={0.5}>
        Beta
      </Stamp>,
    );

    const style = screen.getByText("Beta").getAttribute("style") ?? "";

    expect(style).toContain("--rrs-color: rebeccapurple");
    expect(style).toContain("--rrs-rotate: -15deg");
    expect(style).toContain("--rrs-opacity: 0.5");
  });

  it("applies a mask by default and drops it when distress is none", () => {
    const { rerender } = render(<Stamp>Beta</Stamp>);
    expect(screen.getByText("Beta").getAttribute("style")).toContain(
      "mask-image",
    );

    rerender(<Stamp distress="none">Beta</Stamp>);
    expect(screen.getByText("Beta").getAttribute("style")).not.toContain(
      "mask-image",
    );
  });

  it("keeps the same mask across renders so SSR and client agree", () => {
    const { rerender } = render(<Stamp seed="release">Beta</Stamp>);
    const first = screen.getByText("Beta").getAttribute("style");

    rerender(<Stamp seed="release">Beta</Stamp>);

    expect(screen.getByText("Beta").getAttribute("style")).toBe(first);
  });

  it("forwards unknown props and merges className", () => {
    render(
      <Stamp className="custom" data-testid="stamp" aria-hidden="true">
        Beta
      </Stamp>,
    );

    const element = screen.getByTestId("stamp");

    expect(element.className).toContain("react-rubber-stamp");
    expect(element.className).toContain("custom");
    expect(element.getAttribute("aria-hidden")).toBe("true");
  });

  it("draws a single frame line", () => {
    render(<Stamp data-testid="stamp">Beta</Stamp>);

    // The frame is the element's own border. Nothing draws a second line, so
    // the stylesheet must not carry a ::before rule for the stamp either.
    expect(screen.getByTestId("stamp").className).not.toContain(
      "react-rubber-stamp--single",
    );
    expect(CSS).not.toContain(".react-rubber-stamp::before");
  });

  it("splatters by default and stops when speckle is 0", () => {
    const { rerender } = render(<Stamp data-testid="stamp">Beta</Stamp>);

    expect(screen.getByTestId("stamp").className).toContain(
      "react-rubber-stamp--speckled",
    );

    rerender(
      <Stamp data-testid="stamp" speckle={0}>
        Beta
      </Stamp>,
    );

    const element = screen.getByTestId("stamp");

    expect(element.className).not.toContain("react-rubber-stamp--speckled");
    expect(element.getAttribute("style")).not.toContain("--rrs-speckle-mask");
  });

  it("lets speckle be set independently of distress", () => {
    // A crisp press can still spatter, and a worn one can stay tidy.
    render(
      <Stamp data-testid="clean" distress="heavy" speckle={0}>
        Beta
      </Stamp>,
    );

    expect(screen.getByTestId("clean").className).not.toContain(
      "react-rubber-stamp--speckled",
    );
  });

  it("lets inline style win over derived custom properties", () => {
    render(
      <Stamp color="red" style={{ ["--rrs-color" as string]: "blue" }}>
        Beta
      </Stamp>,
    );

    expect(screen.getByText("Beta").getAttribute("style")).toContain(
      "--rrs-color: blue",
    );
  });
});

describe("hashSeed", () => {
  it("is stable for the same input", () => {
    expect(hashSeed("beta")).toBe(hashSeed("beta"));
  });

  it("separates different inputs", () => {
    expect(hashSeed("beta")).not.toBe(hashSeed("alpha"));
  });

  it("normalizes numbers, including negatives", () => {
    expect(hashSeed(42)).toBe(42);
    expect(hashSeed(-42)).toBe(42);
    expect(hashSeed(10042)).toBe(42);
  });
});

describe("buildTextureMask", () => {
  it("returns nothing for no distress", () => {
    expect(buildTextureMask("none", "x")).toBeUndefined();
  });

  it("produces a data URI carrying the seed", () => {
    const mask = buildTextureMask("medium", 7);

    expect(mask).toContain("data:image/svg+xml");
    expect(decodeURIComponent(mask!)).toContain('seed="7"');
  });

  it("varies the pattern with the distress level", () => {
    expect(buildTextureMask("light", "x")).not.toBe(
      buildTextureMask("heavy", "x"),
    );
  });

  it("eats away more ink as the distress level rises", () => {
    // The alpha table decides how much ink survives. Averaging it gives a
    // coverage figure that has to fall monotonically, otherwise "heavy" would
    // print cleaner than "light".
    const coverage = (distress: Distress) => {
      const svg = decodeURIComponent(buildTextureMask(distress, "x")!);
      const table = svg.match(/tableValues="([\d. ]+)"/)![1];
      const values = table.split(" ").map(Number);

      return values.reduce((sum, value) => sum + value, 0) / values.length;
    };

    expect(coverage("light")).toBeGreaterThan(coverage("medium"));
    expect(coverage("medium")).toBeGreaterThan(coverage("heavy"));
  });

  it("keeps every level legible by never cutting away most of the ink", () => {
    // A mask that survives on under half its area turns the text into a ghost.
    // "heavy" is the floor here, so guarding it guards all of them.
    const svg = decodeURIComponent(buildTextureMask("heavy", "x")!);
    const values = svg
      .match(/tableValues="([\d. ]+)"/)![1]
      .split(" ")
      .map(Number);
    const average =
      values.reduce((sum, value) => sum + value, 0) / values.length;

    expect(average).toBeGreaterThan(0.5);
  });

  it("tiles the texture at a fixed size so the grain does not stretch", () => {
    // A stretched mask smears into horizontal streaks on wide stamps, so the
    // SVG has to be square and tiled rather than scaled to the element.
    const svg = decodeURIComponent(buildTextureMask("medium", "x")!);

    expect(svg).toContain(`width="${TEXTURE_TILE_SIZE}"`);
    expect(svg).toContain(`height="${TEXTURE_TILE_SIZE}"`);
  });

  it("layers scratches over the blotches with an independent seed", () => {
    // Sharing a seed would line the streaks up with the patches they cross,
    // which reads as one pattern instead of two kinds of wear.
    const svg = decodeURIComponent(buildTextureMask("medium", 7)!);
    const seeds = [...svg.matchAll(/seed="(\d+)"/g)].map((m) => m[1]);

    expect(seeds).toHaveLength(2);
    expect(seeds[0]).not.toBe(seeds[1]);
  });
});

describe("buildSpeckleMask", () => {
  const dotCount = (speckle: Speckle) => {
    const mask = buildSpeckleMask(speckle, "x");

    return mask
      ? [...decodeURIComponent(mask).matchAll(/<circle /g)].length
      : 0;
  };

  it("draws nothing at level 0", () => {
    expect(buildSpeckleMask(0, "x")).toBeUndefined();
  });

  it("adds more flecks at every step of the scale", () => {
    const counts = SPECKLE_LEVELS.map(dotCount);

    // Each level has to out-splatter the one below it, or the scale has gaps
    // the caller cannot see.
    for (let i = 1; i < counts.length; i++) {
      expect(counts[i]).toBeGreaterThan(counts[i - 1]);
    }
  });

  it("separates neighbouring levels enough to tell them apart", () => {
    // A ramp that rises by a hair per step looks like one setting with noise.
    // Each level carries at least half again as many dots as the last.
    const counts = SPECKLE_LEVELS.filter((level) => level !== 0).map(dotCount);

    for (let i = 1; i < counts.length; i++) {
      expect(counts[i]).toBeGreaterThan(counts[i - 1] * 1.5);
    }
  });

  it("paints white, since only the alpha channel survives a mask", () => {
    // currentColor does not resolve inside a data URI, so a colored fill here
    // would print black dots on every non-black stamp.
    const svg = decodeURIComponent(buildSpeckleMask(2, "x")!);

    expect(svg).toContain('fill="#fff"');
    expect(svg).not.toContain("currentColor");
  });

  it("is deterministic, so server and client renders agree", () => {
    expect(buildSpeckleMask(3, "release")).toBe(buildSpeckleMask(3, "release"));
    expect(buildSpeckleMask(3, "release")).not.toBe(
      buildSpeckleMask(3, "other"),
    );
  });

  it("keeps every fleck inside the tile", () => {
    // A dot straddling the tile edge would repeat as a clipped half-circle on
    // the opposite side once the mask tiles.
    const svg = decodeURIComponent(buildSpeckleMask(4, "x")!);
    const circles = [
      ...svg.matchAll(/<circle cx="([\d.]+)" cy="([\d.]+)" r="([\d.]+)"/g),
    ];

    expect(circles.length).toBeGreaterThan(0);

    for (const [, cx, cy] of circles) {
      expect(Number(cx)).toBeGreaterThanOrEqual(0);
      expect(Number(cx)).toBeLessThanOrEqual(TEXTURE_TILE_SIZE);
      expect(Number(cy)).toBeGreaterThanOrEqual(0);
      expect(Number(cy)).toBeLessThanOrEqual(TEXTURE_TILE_SIZE);
    }
  });
});
