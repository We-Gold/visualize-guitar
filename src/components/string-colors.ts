import { STRING_CONFIGS } from "./string-animator"

/**
 * Colors for each guitar string derived from the SVG string gradient's base color.
 * Index 0 = string 1 (high E), index 5 = string 6 (low E).
 * Uses colors[2] — the mid-tone of the 5-stop metallic gradient — which is the
 * most distinctive, perceptually representative color for each string.
 */
export const STRING_WAVEFORM_COLORS = Array.from(
    { length: 6 },
    (_, i) => STRING_CONFIGS[i + 1].colors[2],
)

