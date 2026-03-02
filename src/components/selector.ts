import * as d3 from "d3"
import type { AudioMode } from "../audio/audio-modes"

const SELECTOR_SVG_PATH = "./img/Selector.svg"

/** Center X of the pill text area in SVG coordinates */
const TEXT_CENTER_X = 134

/** Center Y of the pill text area in SVG coordinates */
const TEXT_CENTER_Y = 33

/**
 * How far (in SVG units) text travels off-screen during a slide transition.
 * Must be >= half the clip rect height so text is fully hidden before entering.
 */
const SLIDE_OFFSET = 54

/** Duration of the text slide transition in milliseconds */
const TRANSITION_DURATION = 280

const LABEL_FONT_SIZE = 16

export class Selector {
    private container: HTMLElement
    private modes: AudioMode[] = []
    private currentIndex = 0
    private isStarted = false
    private isAnimating = false

    private svg?: d3.Selection<SVGSVGElement, unknown, null, undefined>
    private labelCurrent?: d3.Selection<
        SVGTextElement,
        unknown,
        null,
        undefined
    >
    private labelIncoming?: d3.Selection<
        SVGTextElement,
        unknown,
        null,
        undefined
    >
    private prevArrow?: d3.Selection<SVGPathElement, unknown, null, undefined>
    private nextArrow?: d3.Selection<SVGPathElement, unknown, null, undefined>
    private nextArrowGroup?: d3.Selection<SVGGElement, unknown, null, undefined>

    constructor(container: HTMLElement) {
        this.container = container
    }

    addSelector(
        modes: AudioMode[],
        onStart: () => void,
        onModeChange: (index: number) => void,
    ): void {
        this.modes = modes

        d3.xml(SELECTOR_SVG_PATH).then((xml) => {
            const svgEl = xml.documentElement
            svgEl.id = "selector-svg"
            this.container.appendChild(svgEl)

            this.svg = d3.select(svgEl) as unknown as d3.Selection<
                SVGSVGElement,
                unknown,
                null,
                undefined
            >

            // Hide the baked-in label path
            this.svg.select("#selector-label-group").attr("display", "none")

            // Add matching glow filter for the up (prev) arrow.
            // filter2_d_15_681 uses filterUnits="userSpaceOnUse" with y≈34–69
            // which is the down arrow region — we need the same filter but for
            // the up arrow region (y≈-1 to 35).
            const defs = this.svg.select("defs")
            const prevGlow = defs
                .append("filter")
                .attr("id", "selector-prev-glow")
                .attr("x", "281.273")
                .attr("y", "-1.1")
                .attr("width", "35.7271")
                .attr("height", "35.2868")
                .attr("filterUnits", "userSpaceOnUse")
                .attr("color-interpolation-filters", "sRGB")
            prevGlow
                .append("feFlood")
                .attr("flood-opacity", "0")
                .attr("result", "BackgroundImageFix")
            prevGlow
                .append("feColorMatrix")
                .attr("in", "SourceAlpha")
                .attr("type", "matrix")
                .attr("values", "0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0")
                .attr("result", "hardAlpha")
            prevGlow.append("feOffset")
            prevGlow.append("feGaussianBlur").attr("stdDeviation", "3.5")
            prevGlow
                .append("feComposite")
                .attr("in2", "hardAlpha")
                .attr("operator", "out")
            prevGlow
                .append("feColorMatrix")
                .attr("type", "matrix")
                .attr(
                    "values",
                    "0 0 0 0 0.905882 0 0 0 0 0.658824 0 0 0 0 0.364706 0 0 0 0.71 0",
                )
            prevGlow
                .append("feBlend")
                .attr("mode", "normal")
                .attr("in2", "BackgroundImageFix")
                .attr("result", "effect1_dropShadow")
            prevGlow
                .append("feBlend")
                .attr("mode", "normal")
                .attr("in", "SourceGraphic")
                .attr("in2", "effect1_dropShadow")
                .attr("result", "shape")

            // Add a clipPath in <defs> to mask the text to the pill interior
            defs.append("clipPath")
                .attr("id", "label-clip")
                .append("rect")
                .attr("x", 32)
                .attr("y", 6)
                .attr("width", 232)
                .attr("height", 54)

            // Create the masked text stage
            const stage = this.svg
                .append("g")
                .attr("id", "label-stage")
                .attr("clip-path", "url(#label-clip)")

            // Helper to apply shared text attributes
            const applyTextAttrs = (
                sel: d3.Selection<SVGTextElement, unknown, null, undefined>,
            ) =>
                sel
                    .attr("x", TEXT_CENTER_X)
                    .attr("text-anchor", "middle")
                    .attr("dominant-baseline", "central")
                    .attr("fill", "#E7A85D")
                    .attr("font-family", "Inconsolata, monospace")
                    .attr("font-size", LABEL_FONT_SIZE)
                    .attr("font-weight", "700")
                    .attr("letter-spacing", "0.5")
                    .style("user-select", "none")
                    .attr("pointer-events", "none")

            this.labelCurrent = applyTextAttrs(
                stage
                    .append("text")
                    .attr("id", "label-current")
                    .attr("y", TEXT_CENTER_Y),
            )
            this.labelIncoming = applyTextAttrs(
                stage
                    .append("text")
                    .attr("id", "label-incoming")
                    .attr("y", TEXT_CENTER_Y)
                    .attr("opacity", 0),
            )

            this.labelCurrent.text("CLICK TO START")

            // Store arrow references
            this.prevArrow = this.svg.select(
                "#selector-prev",
            ) as unknown as d3.Selection<
                SVGPathElement,
                unknown,
                null,
                undefined
            >
            this.nextArrow = this.svg.select(
                "#selector-next",
            ) as unknown as d3.Selection<
                SVGPathElement,
                unknown,
                null,
                undefined
            >

            // Strip the baked-in orange glow from the next arrow group so
            // arrows are glow-free by default; the pulse class adds it back
            // only when needed.
            this.nextArrowGroup = this.svg.select(
                "#selector-next-group",
            ) as unknown as d3.Selection<SVGGElement, unknown, null, undefined>
            this.nextArrowGroup.attr("filter", null)

            this.renderArrows()

            // Pill click → start
            this.svg
                .select("#selector-pill")
                .style("cursor", "pointer")
                .on("click", () => {
                    if (this.isStarted) return
                    this.isStarted = true

                    // Remove pill click handler
                    this.svg!.select("#selector-pill")
                        .style("cursor", "default")
                        .on("click", null)

                    // Start audio (async, runs in parallel with animation)
                    onStart()

                    // Animate label from "CLICK TO START" to mode 0
                    this.transitionTo(0, "none").then(() => {
                        this.renderArrows()
                        this.setupArrowHandlers(onModeChange)
                    })
                })
        })
    }

    private setupArrowHandlers(onModeChange: (index: number) => void): void {
        this.prevArrow!.on("click", () => {
            if (this.isAnimating || this.currentIndex <= 0) return
            const newIndex = this.currentIndex - 1
            onModeChange(newIndex)
            this.transitionTo(newIndex, "prev")
        })

        this.nextArrow!.on("click", () => {
            if (this.isAnimating || this.currentIndex >= this.modes.length - 1)
                return
            this.stopPulse()
            const newIndex = this.currentIndex + 1
            onModeChange(newIndex)
            this.transitionTo(newIndex, "next")
        })
    }

    private transitionTo(
        newIndex: number,
        direction: "prev" | "next" | "none",
    ): Promise<void> {
        return new Promise((resolve) => {
            const newName = this.modes[newIndex].name
            this.isAnimating = true

            if (direction === "none") {
                // Cross-fade: current fades out, incoming fades in simultaneously
                this.labelIncoming!.text(newName)
                    .attr("y", TEXT_CENTER_Y)
                    .attr("opacity", 0)

                this.labelCurrent!.transition().duration(180).attr("opacity", 0)

                this.labelIncoming!.transition()
                    .duration(180)
                    .attr("opacity", 1)
                    .on("end", () => {
                        // Swap: promote incoming to current
                        this.labelCurrent!.text(newName)
                            .attr("y", TEXT_CENTER_Y)
                            .attr("opacity", 1)
                        this.labelIncoming!.attr("opacity", 0)
                        this.isAnimating = false
                        this.currentIndex = newIndex
                        this.startPulse()
                        resolve()
                    })
                return
            }

            // Directional slide
            const exitY =
                direction === "next"
                    ? TEXT_CENTER_Y - SLIDE_OFFSET
                    : TEXT_CENTER_Y + SLIDE_OFFSET
            const enterFromY =
                direction === "next"
                    ? TEXT_CENTER_Y + SLIDE_OFFSET
                    : TEXT_CENTER_Y - SLIDE_OFFSET

            this.labelIncoming!.text(newName)
                .attr("y", enterFromY)
                .attr("opacity", 1)

            // Current exits
            this.labelCurrent!.transition()
                .duration(TRANSITION_DURATION)
                .ease(d3.easeCubicInOut)
                .attr("y", exitY)

            // Incoming enters — completion drives the state update
            this.labelIncoming!.transition()
                .duration(TRANSITION_DURATION)
                .ease(d3.easeCubicInOut)
                .attr("y", TEXT_CENTER_Y)
                .on("end", () => {
                    this.labelCurrent!.text(newName)
                        .attr("y", TEXT_CENTER_Y)
                        .attr("opacity", 1)
                    this.labelIncoming!.attr("opacity", 0)
                    this.isAnimating = false
                    this.currentIndex = newIndex
                    this.renderArrows()
                    resolve()
                })
        })
    }

    private startPulse(): void {
        if (!this.nextArrowGroup || this.modes.length <= 1) return
        const el = this.nextArrowGroup.node()
        if (el) el.classList.add("selector-next-pulsing")
    }

    private stopPulse(): void {
        if (!this.nextArrowGroup) return
        const el = this.nextArrowGroup.node()
        if (el) el.classList.remove("selector-next-pulsing")
    }

    private renderArrows(): void {
        if (!this.prevArrow || !this.nextArrow) return

        const prevActive = this.isStarted && this.currentIndex > 0
        const nextActive =
            this.isStarted && this.currentIndex < this.modes.length - 1

        this.prevArrow
            .attr("stroke-opacity", prevActive ? "1" : "0.33")
            .style("cursor", prevActive ? "pointer" : "default")
            .attr("pointer-events", prevActive ? "all" : "none")

        this.nextArrow
            .attr("stroke-opacity", nextActive ? "1" : "0.33")
            .style("cursor", nextActive ? "pointer" : "default")
            .attr("pointer-events", nextActive ? "all" : "none")
    }
}

