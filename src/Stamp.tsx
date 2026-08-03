import * as React from "react";
import {
  buildTextureMask,
  buildSpeckleMask,
  type Distress,
  type Speckle,
} from "./texture";
import { injectStyles } from "./styles";

export type { Distress, Speckle };

/** Where each wear level lands on the splatter scale when `speckle` is omitted. */
const SPECKLE_FOR_DISTRESS: Record<Distress, Speckle> = {
  none: 0,
  light: 1,
  medium: 2,
  heavy: 3,
};

export interface StampProps extends Omit<
  React.HTMLAttributes<HTMLSpanElement>,
  "color"
> {
  /** Text to stamp. Any length — the texture tiles to cover it. */
  children: React.ReactNode;
  /** Ink color. Any CSS color. */
  color?: string;
  /** How worn out the ink looks. */
  distress?: Distress;
  /**
   * Stray flecks of ink scattered around the text, clipped to the frame.
   * `0` is a clean press, `4` spatters. Follows `distress` unless set
   * explicitly.
   */
  speckle?: Speckle;
  /** Rotation in degrees. A slight tilt is what sells the hand-stamped look. */
  rotate?: number;
  /**
   * Varies the noise pattern. Two stamps with the same seed look identical,
   * which keeps server and client renders in sync.
   */
  seed?: string | number;
  /** Blend the ink into whatever is underneath. */
  blendMode?: React.CSSProperties["mixBlendMode"];
  /** Ink coverage, 0-1. */
  opacity?: number;
  /** Allow long text to break across lines instead of staying on one line. */
  wrap?: boolean;
}

/**
 * A worn-out rubber stamp.
 *
 * ```tsx
 * <Stamp>Beta</Stamp>
 * <Stamp color="#1e6f3f" rotate={6}>Approved</Stamp>
 * <Stamp distress="heavy" speckle={4}>Confidential — do not distribute</Stamp>
 * ```
 */
export const Stamp = React.forwardRef<HTMLSpanElement, StampProps>(
  function Stamp(
    {
      children,
      color,
      distress = "medium",
      speckle,
      rotate,
      seed,
      blendMode,
      opacity,
      wrap = false,
      className,
      style,
      ...rest
    },
    ref,
  ) {
    // Injected during render rather than in an effect so the stamp is styled on
    // the very first paint instead of flashing unstyled.
    injectStyles();

    const resolvedSeed =
      seed ?? (typeof children === "string" ? children : "react-rubber-stamp");
    const mask = buildTextureMask(distress, resolvedSeed);

    // Splatter tracks the wear unless asked otherwise: a stamp worn enough to
    // lose ink is the same stamp that flicks it around. The default stays a
    // step below the matching wear level, because splatter competes with the
    // text for attention in a way the wear mask does not.
    const speckleMask = buildSpeckleMask(
      speckle ?? SPECKLE_FOR_DISTRESS[distress],
      resolvedSeed,
    );

    // Only the props that were actually passed become custom properties, so
    // anything left out keeps falling back to the stylesheet's default.
    const cssVariables: Record<string, string> = {};

    if (color !== undefined) {
      cssVariables["--rrs-color"] = color;
    }

    if (rotate !== undefined) {
      cssVariables["--rrs-rotate"] = `${rotate}deg`;
    }

    if (opacity !== undefined) {
      cssVariables["--rrs-opacity"] = String(opacity);
    }

    if (blendMode !== undefined) {
      cssVariables["--rrs-blend-mode"] = blendMode;
    }

    if (speckleMask !== undefined) {
      cssVariables["--rrs-speckle-mask"] = speckleMask;
    }

    const classNames = [
      "react-rubber-stamp",
      wrap ? "react-rubber-stamp--wrap" : undefined,
      speckleMask ? "react-rubber-stamp--speckled" : undefined,
      className,
    ].filter(Boolean);

    return (
      <span
        {...rest}
        ref={ref}
        className={classNames.join(" ")}
        style={{
          ...cssVariables,
          ...(mask ? { WebkitMaskImage: mask, maskImage: mask } : null),
          ...style,
        }}
      >
        {children}
      </span>
    );
  },
);
