import * as d3 from "d3"

// --- SVG coordinate constants for strings (from Guitar.svg) ---

/** Per-string configuration derived from the SVG */
interface StringConfig {
    groupId: string
    centerY: number
    startX: number // bridge end (left)
    endX: number // nut end (right)
    rectHeight: number
    /** Vertical gradient stops for metallic cylinder look: [highlight, light, base, dark, shadow] */
    colors: [string, string, string, string, string]
}

const STRING_CONFIGS: Record<number, StringConfig> = {
    1: {
        groupId: "String 1",
        centerY: 244.16,
        startX: 234.55,
        endX: 1207.16,
        rectHeight: 4.703,
        colors: ["#FFFFFF", "#C0C0C0", "#626262", "#383838", "#1A1A1A"],
    },
    2: {
        groupId: "String 2",
        centerY: 264.73,
        startX: 234.54,
        endX: 1207.6,
        rectHeight: 4.788,
        colors: ["#F8E8E0", "#D8A8A0", "#B06058", "#783830", "#381818"],
    },
    3: {
        groupId: "String 3",
        centerY: 285.31,
        startX: 234.54,
        endX: 1207.6,
        rectHeight: 4.871,
        colors: ["#F8E0C8", "#D8B088", "#A87048", "#704828", "#382010"],
    },
    4: {
        groupId: "String 4",
        centerY: 305.89,
        startX: 234.54,
        endX: 1207.6,
        rectHeight: 4.703,
        colors: ["#FFE8B0", "#FFC868", "#E89018", "#A06008", "#584000"],
    },
    5: {
        groupId: "String 5",
        centerY: 326.47,
        startX: 234.46,
        endX: 1207.6,
        rectHeight: 4.703,
        colors: ["#FFF0D8", "#F0D0A0", "#D8A860", "#987840", "#585030"],
    },
    6: {
        groupId: "String 6",
        centerY: 347.04,
        startX: 234.62,
        endX: 1207.23,
        rectHeight: 4.703,
        colors: ["#FFFFFF", "#F0ECE4", "#D8D4C8", "#A09C90", "#606058"],
    },
}

/**
 * Center X of each fret wire, indexed by fret number (1–17).
 */
const FRET_X: Record<number, number> = {
    1: 1153.6,
    2: 1098.6,
    3: 1045.6,
    4: 996.6,
    5: 954.6,
    6: 914.6,
    7: 875.6,
    8: 838.6,
    9: 804.6,
    10: 775.6,
    11: 749.6,
    12: 724.6,
    13: 700.6,
    14: 676.6,
    15: 653.6,
    16: 630.6,
    17: 609.6,
}

/** Number of sample points for the vibrating path */
const PATH_SAMPLES = 60

/** Maximum amplitude per string (thicker strings = more amplitude) */
const MAX_AMPLITUDE: Record<number, number> = {
    1: 2.0,
    2: 2.3,
    3: 2.6,
    4: 3.0,
    5: 3.5,
    6: 4.0,
}

/** Base angular speed per string (higher strings vibrate faster visually) */
const BASE_SPEED: Record<number, number> = {
    1: 40,
    2: 35,
    3: 30,
    4: 26,
    5: 22,
    6: 18,
}

/** Exponential decay rate — higher = faster decay */
const DECAY_RATE = 4.5

// --- Types ---

interface VibrationState {
    active: boolean
    noteStartTime: number
    noteDuration: number
    fret: number
    velocity: number
}

/** Persistent path elements for a string (always present once initialized) */
interface StringPaths {
    basePath: d3.Selection<SVGPathElement, unknown, null, undefined>
    highlightPath: d3.Selection<SVGPathElement, unknown, null, undefined>
    shadowPath: d3.Selection<SVGPathElement, unknown, null, undefined>
}

export interface ActiveNote {
    time: number
    duration: number
    string: number
    fret: number
    velocity?: number
}

/**
 * Replaces the original SVG string elements with path-based rendering.
 * All 6 strings are always rendered as paths with proper metallic gradients.
 * When a note is played, the bridge-to-fret segment vibrates as a standing wave
 * with exponential decay while the fret-to-nut segment stays straight.
 */
export class StringAnimator {
    private svg: d3.Selection<SVGElement, unknown, null, undefined>
    private stringsGroup: d3.Selection<SVGGElement, unknown, null, undefined>
    private vibrationState: Record<number, VibrationState> = {}
    private stringPaths: Record<number, StringPaths> = {}
    private initialized = false

    constructor(svgElement: SVGElement) {
        this.svg = d3.select(svgElement)
        this.stringsGroup = this.svg.select<SVGGElement>("#Strings_2")

        // Initialize per-string vibration state
        for (let s = 1; s <= 6; s++) {
            this.vibrationState[s] = {
                active: false,
                noteStartTime: 0,
                noteDuration: 1,
                fret: 0,
                velocity: 1,
            }
        }

        this.initStrings()
    }

    /**
     * Hide original string groups, create metallic gradients,
     * and create persistent path elements for all 6 strings.
     */
    private initStrings(): void {
        const defs = this.svg.select("defs")

        for (let s = 1; s <= 6; s++) {
            const config = STRING_CONFIGS[s]
            if (!config) continue

            // Hide the original SVG string group
            this.stringsGroup
                .select(`#${CSS.escape(config.groupId)}`)
                .attr("display", "none")

            // Create a vertical linear gradient for the metallic cylinder look
            const gradId = `string-metallic-${s}`
            const halfH = config.rectHeight / 2
            const grad = defs
                .append("linearGradient")
                .attr("id", gradId)
                .attr("x1", "0")
                .attr("y1", String(config.centerY - halfH))
                .attr("x2", "0")
                .attr("y2", String(config.centerY + halfH))
                .attr("gradientUnits", "userSpaceOnUse")

            const [highlight, light, base, dark, shadow] = config.colors
            grad.append("stop")
                .attr("offset", "0%")
                .attr("stop-color", highlight)
            grad.append("stop").attr("offset", "25%").attr("stop-color", light)
            grad.append("stop").attr("offset", "50%").attr("stop-color", base)
            grad.append("stop").attr("offset", "78%").attr("stop-color", dark)
            grad.append("stop")
                .attr("offset", "100%")
                .attr("stop-color", shadow)

            // Create the 3 path layers (shadow first, then base, then highlight on top)
            const shadowPath = this.stringsGroup
                .append("path")
                .attr("fill", "none")
                .attr("stroke", "black")
                .attr("stroke-opacity", 0.18)
                .attr("stroke-width", 1)
                .attr("stroke-linecap", "round")

            const basePath = this.stringsGroup
                .append("path")
                .attr("fill", "none")
                .attr("stroke", `url(#${gradId})`)
                .attr("stroke-width", config.rectHeight)
                .attr("stroke-linecap", "round")

            const highlightPath = this.stringsGroup
                .append("path")
                .attr("fill", "none")
                .attr("stroke", "white")
                .attr("stroke-opacity", 0.3)
                .attr("stroke-width", 1)
                .attr("stroke-linecap", "round")

            this.stringPaths[s] = { basePath, highlightPath, shadowPath }

            // Draw initial straight line
            this.drawStraightString(s)
        }

        this.initialized = true
    }

    /**
     * Draw a completely straight string (no vibration).
     */
    private drawStraightString(stringNum: number): void {
        const config = STRING_CONFIGS[stringNum]
        const paths = this.stringPaths[stringNum]
        if (!config || !paths) return

        const { startX, endX, centerY, rectHeight } = config
        const halfH = rectHeight / 2
        const sx = startX + halfH
        const ex = endX - halfH

        paths.basePath.attr("d", `M${sx},${centerY}L${ex},${centerY}`)
        paths.highlightPath.attr(
            "d",
            `M${sx},${centerY - halfH + 0.5}L${ex},${centerY - halfH + 0.5}`,
        )
        paths.shadowPath.attr(
            "d",
            `M${sx},${centerY + halfH - 0.5}L${ex},${centerY + halfH - 0.5}`,
        )
    }

    /**
     * Generate path `d` attributes for a string, with optional vibration
     * on the bridge-to-fret segment and a straight fret-to-nut segment.
     */
    private updateStringPaths(stringNum: number, elapsed: number): void {
        const state = this.vibrationState[stringNum]
        const config = STRING_CONFIGS[stringNum]
        const paths = this.stringPaths[stringNum]
        if (!config || !paths) return

        // If not vibrating or decay is complete, draw straight
        if (!state.active) {
            this.drawStraightString(stringNum)
            return
        }

        const progress = Math.min(
            1,
            (elapsed - state.noteStartTime) / state.noteDuration,
        )

        // Exponential decay
        const amplitude =
            MAX_AMPLITUDE[stringNum] *
            state.velocity *
            Math.exp(-DECAY_RATE * progress)

        // If amplitude is negligible, draw straight and deactivate
        if (amplitude < 0.05) {
            this.drawStraightString(stringNum)
            state.active = false
            return
        }

        const { startX, endX, centerY, rectHeight } = config
        const halfH = rectHeight / 2
        const sx = startX + halfH
        const ex = endX - halfH
        const baseSpeed = BASE_SPEED[stringNum]
        const t = elapsed

        // Determine vibrating segment: bridge (sx) → fretX, static: fretX → nut (ex)
        const fretX = state.fret > 0 ? FRET_X[state.fret] : null
        const vibrateEndX = fretX !== null ? fretX : ex

        const vibrateLength = vibrateEndX - sx
        const baseD: string[] = []
        const highlightD: string[] = []
        const shadowD: string[] = []

        // -- Vibrating segment (bridge → fret) --
        for (let i = 0; i <= PATH_SAMPLES; i++) {
            const x = sx + (vibrateLength * i) / PATH_SAMPLES
            const xNorm = i / PATH_SAMPLES

            // Standing wave: superposition of 3 harmonic modes
            const mode1 =
                Math.sin(1 * Math.PI * xNorm) * Math.sin(baseSpeed * t)
            const mode2 =
                0.4 *
                Math.sin(2 * Math.PI * xNorm) *
                Math.sin(baseSpeed * 1.7 * t)
            const mode3 =
                0.15 *
                Math.sin(3 * Math.PI * xNorm) *
                Math.sin(baseSpeed * 2.8 * t)

            const dy = amplitude * (mode1 + mode2 + mode3)

            const cmd = i === 0 ? "M" : "L"
            baseD.push(`${cmd}${x.toFixed(1)},${(centerY + dy).toFixed(2)}`)
            highlightD.push(
                `${cmd}${x.toFixed(1)},${(centerY - halfH + 0.5 + dy).toFixed(2)}`,
            )
            shadowD.push(
                `${cmd}${x.toFixed(1)},${(centerY + halfH - 0.5 + dy).toFixed(2)}`,
            )
        }

        // -- Static segment (fret → nut), straight line --
        if (fretX !== null) {
            baseD.push(`L${ex},${centerY}`)
            highlightD.push(`L${ex},${centerY - halfH + 0.5}`)
            shadowD.push(`L${ex},${centerY + halfH - 0.5}`)
        }

        paths.basePath.attr("d", baseD.join(""))
        paths.highlightPath.attr("d", highlightD.join(""))
        paths.shadowPath.attr("d", shadowD.join(""))
    }

    /**
     * Main update method called every animation frame.
     * Determines which strings should vibrate and updates all paths.
     */
    updateAll(elapsed: number, activeNotes: ActiveNote[]): void {
        if (!this.initialized) return

        // Build a map: for each string, find the most recent active note
        const latestNotePerString: Record<number, ActiveNote> = {}
        for (const note of activeNotes) {
            const existing = latestNotePerString[note.string]
            if (!existing || note.time > existing.time) {
                latestNotePerString[note.string] = note
            }
        }

        for (let s = 1; s <= 6; s++) {
            const note = latestNotePerString[s]
            const state = this.vibrationState[s]

            if (note) {
                // A note is active — (re)activate if it's a new note
                const needsActivation =
                    !state.active ||
                    note.time !== state.noteStartTime ||
                    note.fret !== state.fret

                if (needsActivation) {
                    state.active = true
                    state.noteStartTime = note.time
                    state.noteDuration = note.duration
                    state.fret = note.fret
                    state.velocity = note.velocity ?? 1
                }
            } else if (state.active) {
                // No active note — check if decay is finished
                const progress =
                    (elapsed - state.noteStartTime) / state.noteDuration
                if (progress >= 1) {
                    state.active = false
                }
            }

            // Update the path (vibrating or straight)
            this.updateStringPaths(s, elapsed)
        }
    }

    /**
     * Stop all vibrations and draw all strings as straight.
     */
    stopAll(): void {
        for (let s = 1; s <= 6; s++) {
            this.vibrationState[s].active = false
            this.drawStraightString(s)
        }
    }
}

