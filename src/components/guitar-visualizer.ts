import * as d3 from "d3"
import type { JSONAudioFile } from "../audio/audio-modes"
import { StringAnimator } from "./string-animator"
import type { ActiveNote } from "./string-animator"

// --- SVG coordinate constants (derived from Guitar.svg) ---

/** Center Y position for each string (1 = high E, 6 = low E) */
const STRING_Y: Record<number, number> = {
    1: 244.16,
    2: 264.73,
    3: 285.31,
    4: 305.89,
    5: 326.47,
    6: 347.04,
}

/** Fill color for each string's indicators */
const STRING_COLORS: Record<number, string> = {
    1: "#2B2222",
    2: "#801110",
    3: "#8C3C24",
    4: "#FE8601",
    5: "#E7A85D",
    6: "#EAE5D5",
}

/**
 * Center X of each fret wire, indexed by fret number (1–17).
 * Fret 0 = open string (no wire).
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

/** X position of the nut (right edge of fretboard, near headstock) */
const NUT_X = 1210

/** X center of the sound hole for strum indicators */
const STRUM_X = 481

/** Radius for fret finger circles (matches existing SVG examples) */
const FINGER_RADIUS = 7.443

/** Radius for strum indicator circles */
const STRUM_RADIUS = 6

/** Maximum display duration for strum circles (in seconds) */
const MAX_STRUM_DURATION = 0.2

/** Duration of the fret-to-fret slide animation in seconds */
const SLIDE_DURATION = 0.06

// --- Types ---

/** Quadratic ease-out: fast start, decelerates at target */
function easeOut(t: number): number {
    return 1 - (1 - t) * (1 - t)
}

interface NoteWithKey {
    key: string
    time: number
    duration: number
    string: number
    fret: number
    velocity: number
}

/** Per-string state for animated fret finger slides */
interface FingerAnimState {
    visible: boolean
    currentX: number
    targetX: number
    animStartX: number
    animStartElapsed: number
    /** X position of the last fretted note on this string; retained after note ends so
     *  the next note can slide from here. Reset to null when an open string is played. */
    lastKnownFretX: number | null
}

/**
 * Computes the X position to place a finger for a given fret.
 * Returns the midpoint between the fret wire and the previous fret wire (or the nut).
 * Returns null for open strings (fret 0).
 */
function getFretFingerX(fret: number): number | null {
    if (fret <= 0) return null
    const fretWireX = FRET_X[fret]
    if (fretWireX === undefined) return null

    // The "previous" fret wire is the one closer to the nut (higher fret number = further left,
    // but in our coordinate system higher fret number = smaller X... wait, fret 1 has the largest X).
    // Previous fret (closer to nut) = fret - 1. For fret 1, previous = nut.
    const prevX = fret === 1 ? NUT_X : FRET_X[fret - 1]
    if (prevX === undefined) return null

    return (fretWireX + prevX) / 2
}

/**
 * Given an array of notes, return at most one note per string,
 * keeping the one with the latest start time (latest note wins).
 */
function latestNotePerString(notes: NoteWithKey[]): NoteWithKey[] {
    const map: Record<number, NoteWithKey> = {}
    for (const n of notes) {
        const existing = map[n.string]
        if (!existing || n.time > existing.time) {
            map[n.string] = n
        }
    }
    return Object.values(map)
}

export class GuitarVisualizer {
    private svg: d3.Selection<SVGElement, unknown, null, undefined>
    private fingersGroup!: d3.Selection<SVGGElement, unknown, null, undefined>
    private strumsGroup!: d3.Selection<SVGGElement, unknown, null, undefined>
    private stringAnimator: StringAnimator
    private notes: NoteWithKey[] = []
    private playStartTime = 0
    private isActive = false
    private fingerStates: Record<number, FingerAnimState> = {}
    private fingerCircles: Record<
        number,
        d3.Selection<SVGCircleElement, unknown, null, undefined> | null
    > = {}

    constructor(svgElement: SVGElement) {
        this.svg = d3.select(svgElement)
        this.stringAnimator = new StringAnimator(svgElement)
        this.initGroups()

        for (let s = 1; s <= 6; s++) {
            this.fingerStates[s] = {
                visible: false,
                currentX: 0,
                targetX: 0,
                animStartX: 0,
                animStartElapsed: 0,
                lastKnownFretX: null,
            }
            this.fingerCircles[s] = null
        }
    }

    /**
     * Create dynamic SVG groups for fingers and strums,
     * and hide the static example elements.
     */
    private initGroups(): void {
        // Hide static example elements
        this.svg.select("#Fingers").attr("display", "none")
        this.svg.select("#Strum").attr("display", "none")

        // Create gradient for finger stroke if it doesn't exist
        this.createFingerGradient()

        // Create groups inside #Guitar for dynamic elements
        const guitarGroup = this.svg.select("#Guitar")
        this.strumsGroup = guitarGroup.append("g").attr("id", "dynamic-strums")
        this.fingersGroup = guitarGroup
            .append("g")
            .attr("id", "dynamic-fingers")
    }

    /**
     * Create a linear gradient for finger stroke (white to gray).
     * This gradient is added to the SVG's defs section if it doesn't already exist.
     */
    private createFingerGradient(): void {
        const defs = this.svg.select("defs")
        const gradientId = "dynamic-finger-stroke"

        // Check if gradient already exists
        if (defs.select(`#${gradientId}`).empty()) {
            defs.append("linearGradient")
                .attr("id", gradientId)
                .attr("x1", "0%")
                .attr("y1", "0%")
                .attr("x2", "0%")
                .attr("y2", "100%")
                .selectAll("stop")
                .data([
                    { offset: "0%", color: "white" },
                    { offset: "100%", color: "#999999" },
                ])
                .enter()
                .append("stop")
                .attr("offset", (d) => d.offset)
                .attr("stop-color", (d) => d.color)
        }
    }

    /**
     * Load note data from the JSON audio file.
     * Pre-processes notes into a flat, sorted array with unique keys.
     */
    async load(
        jsonData: JSONAudioFile,
        durationMultiplier: number = 1,
    ): Promise<void> {
        this.notes = []
        let noteIndex = 0

        jsonData.tracks.forEach((track) => {
            track.notes.forEach((note) => {
                this.notes.push({
                    key: `n${noteIndex++}`,
                    time: note.time,
                    duration: note.duration * durationMultiplier,
                    string: note.string,
                    fret: note.fret,
                    velocity: note.velocity,
                })
            })
        })

        // Sort by time for efficient scanning
        this.notes.sort((a, b) => a.time - b.time)
    }

    /**
     * Set the playback start time (Tone.now() value when play() was called).
     */
    start(playStartTime: number): void {
        this.playStartTime = playStartTime
        this.isActive = true
    }

    /**
     * Remove a single finger circle from the DOM and mark it not-visible.
     * lastKnownFretX is intentionally preserved so the next note can slide from here.
     */
    private hideFingerCircle(stringNum: number): void {
        const circle = this.fingerCircles[stringNum]
        if (circle) {
            circle.remove()
            this.fingerCircles[stringNum] = null
        }
        this.fingerStates[stringNum].visible = false
    }

    /**
     * Per-frame update for fret finger circles with slide animation.
     *
     * - Fingers slide from the previous note's fret to the new note's fret when a
     *   new note starts on a string that had a prior fretted note.
     * - Fingers snap on the very first appearance (no prior note on this string).
     * - Fingers are removed immediately when the active note ends.
     * - lastKnownFretX is cleared when an open string is played, so the next
     *   fretted note snaps rather than sliding in from a stale position.
     */
    private updateFingerCircles(
        elapsed: number,
        activeNotes: NoteWithKey[],
    ): void {
        // Build a map: for each string, find the most recent active note
        const latestByString: Record<number, NoteWithKey> = {}
        for (const note of activeNotes) {
            const existing = latestByString[note.string]
            if (!existing || note.time > existing.time) {
                latestByString[note.string] = note
            }
        }

        for (let s = 1; s <= 6; s++) {
            const note = latestByString[s]
            const state = this.fingerStates[s]

            // --- Determine desired position ---
            // null means no finger should be visible
            let desiredX: number | null = null
            let isOpenString = false
            if (note) {
                if (note.fret > 0) {
                    desiredX = getFretFingerX(note.fret)
                } else {
                    isOpenString = true
                }
            }

            if (desiredX === null) {
                if (isOpenString) {
                    // Explicit open-string note: hide finger and clear slide origin
                    if (state.visible) {
                        this.hideFingerCircle(s)
                    }
                    state.lastKnownFretX = null
                }
                // No active note (gap between notes): leave the finger visible where it is
                continue
            }

            if (!state.visible) {
                const slideFrom = state.lastKnownFretX
                const shouldSlide = slideFrom !== null && slideFrom !== desiredX

                // Place circle at slide origin (or target if snapping)
                const startX = shouldSlide ? slideFrom! : desiredX
                state.currentX = startX
                state.animStartX = startX
                state.targetX = desiredX
                state.animStartElapsed = elapsed
                state.visible = true

                this.fingerCircles[s] = this.fingersGroup
                    .append("circle")
                    .attr("cx", startX)
                    .attr("cy", STRING_Y[s])
                    .attr("r", FINGER_RADIUS)
                    .attr("fill", STRING_COLORS[s])
                    .attr("fill-opacity", 0.55)
                    .attr("stroke", "url(#dynamic-finger-stroke)")
                    .attr("stroke-width", 1.2)
            } else if (desiredX !== state.targetX) {
                // Fret changed mid-note — slide from current interpolated position
                state.animStartX = state.currentX
                state.targetX = desiredX
                state.animStartElapsed = elapsed
            }

            // Interpolate cx toward target
            const rawProgress =
                (elapsed - state.animStartElapsed) / SLIDE_DURATION
            const progress = Math.min(1, Math.max(0, rawProgress))
            state.currentX =
                state.animStartX +
                (state.targetX - state.animStartX) * easeOut(progress)

            this.fingerCircles[s]!.attr("cx", state.currentX)

            // Remember this fret so the next note on this string can slide from here
            state.lastKnownFretX = desiredX
        }
    }

    /**
     * Stop the visualization and clear all indicators.
     */
    stop(): void {
        this.isActive = false
        for (let s = 1; s <= 6; s++) {
            this.hideFingerCircle(s)
            this.fingerStates[s].lastKnownFretX = null
        }
        this.strumsGroup.selectAll("*").remove()
        this.stringAnimator.stopAll()
    }

    /**
     * Called every animation frame. Determines which notes are active
     * and updates the finger and strum circle indicators via D3 data joins.
     */
    updateFingersAndStrum(currentTime: number): void {
        if (!this.isActive || this.notes.length === 0) return

        const elapsed = currentTime - this.playStartTime

        // Find all notes active at the current elapsed time
        const activeNotes = this.notes.filter(
            (n) => n.time <= elapsed && elapsed < n.time + n.duration,
        )

        // --- String vibration ---
        this.stringAnimator.updateAll(elapsed, activeNotes as ActiveNote[])

        // --- Fret finger indicators (animated slides between frets) ---
        this.updateFingerCircles(elapsed, activeNotes)

        // --- Strum indicators (for all active notes, including open strings) ---
        // Deduplicate to one note per string (latest note wins), then cap display duration
        const strumsForDisplay = latestNotePerString(
            this.notes.filter((n) => {
                const displayDuration = Math.min(n.duration, MAX_STRUM_DURATION)
                return n.time <= elapsed && elapsed < n.time + displayDuration
            }),
        )

        const strums = this.strumsGroup
            .selectAll<SVGCircleElement, NoteWithKey>("circle")
            .data(strumsForDisplay, (d) => String(d.string))

        // Enter: new strum circles
        strums
            .enter()
            .append("circle")
            .attr("cx", STRUM_X)
            .attr("cy", (d) => STRING_Y[d.string])
            .attr("r", STRUM_RADIUS)
            .attr("fill", "white")
            .attr("fill-opacity", 0.53)

        // Update
        strums.attr("cy", (d) => STRING_Y[d.string])

        // Exit
        strums.exit().remove()
    }
}

