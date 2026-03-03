import * as d3 from "d3"
import {
    FRET_X,
    NUT_X,
    STRUM_X,
    STRING_Y,
    STRING_COLORS,
} from "../components/guitar-visualizer"

/** Half-height of each string hit lane in SVG units. */
const LANE_HALF = 10.8

/** Strum zone X boundaries in SVG coords. */
const STRUM_X1 = 340
const STRUM_X2 = 610

type FretClickCallback = (stringNum: number, fret: number) => void
type StrumClickCallback = () => void

/**
 * Transparent SVG overlay on top of the guitar that turns the fretboard
 * into a clickable grid for note entry in edit mode.
 *
 * Usage:
 *   const overlay = new GuitarEditOverlay(svgEl)
 *   overlay.onFretClick(cb)
 *   overlay.onStrumClick(cb)
 *   overlay.show() / overlay.hide()
 *   overlay.setHighlightedNotes([{ string, fret }, ...])  // show static circles for cursor notes
 */
export class GuitarEditOverlay {
    private svg: d3.Selection<SVGElement, unknown, null, undefined>
    private overlayGroup!: d3.Selection<SVGGElement, unknown, null, undefined>
    private fretClickCb: FretClickCallback | null = null
    private strumClickCb: StrumClickCallback | null = null
    private visible = false

    constructor(svgEl: SVGElement) {
        this.svg = d3.select(svgEl)
        this.init()
    }

    private init(): void {
        const guitarGroup = this.svg.select<SVGGElement>("#Guitar")

        // ── Overlay group (sits above all other guitar elements) ──────────────
        this.overlayGroup = guitarGroup
            .append("g")
            .attr("id", "edit-overlay")
            .attr("display", "none")
            .style("cursor", "crosshair")

        // ── Strum zone ────────────────────────────────────────────────────────
        const strumY1 = STRING_Y[6] - LANE_HALF
        const strumHeight = STRING_Y[1] + LANE_HALF - strumY1

        this.overlayGroup
            .append("rect")
            .attr("class", "strum-zone")
            .attr("x", STRUM_X1)
            .attr("y", strumY1)
            .attr("width", STRUM_X2 - STRUM_X1)
            .attr("height", strumHeight)
            .attr("fill", "rgba(255,255,255,0.04)")
            .attr("stroke", "rgba(255,255,255,0.12)")
            .attr("stroke-width", 1)
            .attr("rx", 4)
            .style("cursor", "pointer")
            .on("mouseenter", function () {
                d3.select(this).attr("fill", "rgba(255,255,255,0.10)")
            })
            .on("mouseleave", function () {
                d3.select(this).attr("fill", "rgba(255,255,255,0.04)")
            })
            .on("click", () => {
                this.strumClickCb?.()
            })

        // ── Strum label ───────────────────────────────────────────────────────
        this.overlayGroup
            .append("text")
            .attr("x", STRUM_X)
            .attr("y", strumY1 - 8)
            .attr("text-anchor", "middle")
            .attr("fill", "rgba(255,255,255,0.35)")
            .attr("font-family", "Inconsolata, monospace")
            .attr("font-size", 11)
            .attr("pointer-events", "none")
            .text("STRUM")

        // ── Fret click zones (6 strings × 17 frets) ──────────────────────────
        for (let fret = 1; fret <= 17; fret++) {
            const x1 = FRET_X[fret]
            const x2 = fret === 1 ? NUT_X : FRET_X[fret - 1]
            const width = x2 - x1

            for (let stringNum = 1; stringNum <= 6; stringNum++) {
                const cy = STRING_Y[stringNum]
                const stringColor = STRING_COLORS[stringNum]

                const cell = this.overlayGroup
                    .append("rect")
                    .attr("class", "fret-cell")
                    .attr("data-string", stringNum)
                    .attr("data-fret", fret)
                    .attr("x", x1)
                    .attr("y", cy - LANE_HALF)
                    .attr("width", width)
                    .attr("height", LANE_HALF * 2)
                    .attr("fill", "transparent")
                    .attr("stroke", "rgba(255,255,255,0.06)")
                    .attr("stroke-width", 0.5)
                    .style("cursor", "pointer")

                cell.on("mouseenter", function () {
                    d3.select(this).attr("fill", `${stringColor}44`)
                })
                    .on("mouseleave", function () {
                        d3.select(this).attr("fill", "transparent")
                    })
                    .on("click", () => {
                        this.fretClickCb?.(stringNum, fret)
                    })
            }
        }

        // ── Open-string click zones (just to the right of the nut) ────────────
        const openX1 = NUT_X
        const openX2 = NUT_X + 58

        for (let stringNum = 1; stringNum <= 6; stringNum++) {
            const cy = STRING_Y[stringNum]
            const stringColor = STRING_COLORS[stringNum]

            this.overlayGroup
                .append("rect")
                .attr("class", "open-string-cell")
                .attr("data-string", stringNum)
                .attr("data-fret", 0)
                .attr("x", openX1)
                .attr("y", cy - LANE_HALF)
                .attr("width", openX2 - openX1)
                .attr("height", LANE_HALF * 2)
                .attr("fill", "transparent")
                .attr("stroke", "rgba(255,255,255,0.06)")
                .attr("stroke-width", 0.5)
                .style("cursor", "pointer")
                .on("mouseenter", function () {
                    d3.select(this).attr("fill", `${stringColor}44`)
                })
                .on("mouseleave", function () {
                    d3.select(this).attr("fill", "transparent")
                })
                .on("click", () => {
                    this.fretClickCb?.(stringNum, 0)
                })
        }

        // ── Cursor indicator (vertical glow line at the strum position) ──────
        this.overlayGroup
            .append("line")
            .attr("x1", STRUM_X)
            .attr("x2", STRUM_X)
            .attr("y1", strumY1 - 4)
            .attr("y2", STRING_Y[1] + LANE_HALF + 4)
            .attr("stroke", "rgba(255,200,100,0.6)")
            .attr("stroke-width", 2)
            .attr("pointer-events", "none")
            .style("filter", "drop-shadow(0 0 4px rgba(255,180,60,0.8))")

        // Fret number markers along the top edge
        this.addFretMarkers()
    }

    private addFretMarkers(): void {
        const labelY = STRING_Y[6] - LANE_HALF - 6
        for (const fret of [3, 5, 7, 9, 12, 15, 17] as const) {
            const x = (FRET_X[fret] + FRET_X[fret - 1]) / 2
            this.overlayGroup
                .append("text")
                .attr("x", x)
                .attr("y", labelY)
                .attr("text-anchor", "middle")
                .attr("fill", "rgba(255,255,255,0.30)")
                .attr("font-family", "Inconsolata, monospace")
                .attr("font-size", 10)
                .attr("pointer-events", "none")
                .text(String(fret))
        }
    }

    // ── Public API ────────────────────────────────────────────────────────────

    onFretClick(cb: FretClickCallback): void {
        this.fretClickCb = cb
    }

    onStrumClick(cb: StrumClickCallback): void {
        this.strumClickCb = cb
    }

    show(): void {
        this.visible = true
        this.overlayGroup.attr("display", null)
    }

    hide(): void {
        this.visible = false
        this.overlayGroup.attr("display", "none")
    }

    isVisible(): boolean {
        return this.visible
    }
}

