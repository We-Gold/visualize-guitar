import * as d3 from "d3"
import type { JSONAudioFile } from "../audio/audio-modes"

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

// --- Types ---

interface NoteWithKey {
    key: string
    time: number
    duration: number
    string: number
    fret: number
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

export class GuitarVisualizer {
    private svg: d3.Selection<SVGElement, unknown, null, undefined>
    private fingersGroup!: d3.Selection<SVGGElement, unknown, null, undefined>
    private strumsGroup!: d3.Selection<SVGGElement, unknown, null, undefined>
    private notes: NoteWithKey[] = []
    private playStartTime = 0
    private isActive = false

    constructor(svgElement: SVGElement) {
        this.svg = d3.select(svgElement)
        this.initGroups()
    }

    /**
     * Create dynamic SVG groups for fingers and strums,
     * and hide the static example elements.
     */
    private initGroups(): void {
        // Hide static example elements
        this.svg.select("#Fingers").attr("display", "none")
        this.svg.select("#Strum").attr("display", "none")

        // Create groups inside #Guitar for dynamic elements
        const guitarGroup = this.svg.select("#Guitar")
        this.strumsGroup = guitarGroup.append("g").attr("id", "dynamic-strums")
        this.fingersGroup = guitarGroup
            .append("g")
            .attr("id", "dynamic-fingers")
    }

    /**
     * Load note data from the JSON audio file.
     * Pre-processes notes into a flat, sorted array with unique keys.
     */
    async load(jsonData: JSONAudioFile): Promise<void> {
        this.notes = []
        let noteIndex = 0

        jsonData.tracks.forEach((track) => {
            track.notes.forEach((note) => {
                this.notes.push({
                    key: `n${noteIndex++}`,
                    time: note.time,
                    duration: note.duration,
                    string: note.string,
                    fret: note.fret,
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
     * Stop the visualization and clear all indicators.
     */
    stop(): void {
        this.isActive = false
        this.fingersGroup.selectAll("*").remove()
        this.strumsGroup.selectAll("*").remove()
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

        // --- Fret finger indicators (only for fretted notes, fret > 0) ---
        const frettedNotes = activeNotes.filter((n) => n.fret > 0)

        const fingers = this.fingersGroup
            .selectAll<SVGCircleElement, NoteWithKey>("circle")
            .data(frettedNotes, (d) => d.key)

        // Enter: new finger circles
        fingers
            .enter()
            .append("circle")
            .attr("cx", (d) => getFretFingerX(d.fret)!)
            .attr("cy", (d) => STRING_Y[d.string])
            .attr("r", FINGER_RADIUS)
            .attr("fill", (d) => STRING_COLORS[d.string])
            .attr("fill-opacity", 0.55)
            .attr("stroke", "rgba(255,255,255,0.3)")
            .attr("stroke-width", 0.4)

        // Update: reposition if needed (notes don't move, but ensures correctness)
        fingers
            .attr("cx", (d) => getFretFingerX(d.fret)!)
            .attr("cy", (d) => STRING_Y[d.string])

        // Exit: remove fingers for notes that are no longer active
        fingers.exit().remove()

        // --- Strum indicators (for all active notes, including open strings) ---
        const strums = this.strumsGroup
            .selectAll<SVGCircleElement, NoteWithKey>("circle")
            .data(activeNotes, (d) => d.key)

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

