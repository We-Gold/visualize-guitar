import * as d3 from "d3"
import type { AnalyzerState } from "../audio/audio-controller"
import { STRING_WAVEFORM_COLORS } from "./string-colors"

export type FrequencyMode = "composite" | "per-string"

// ── Plot configuration ───────────────────────────────────────────────────────
const PLOT_CONFIG = {
    width: 360,
    height: 320,
    // Position of the container within the page
    top: "20px",
    right: "20px",
    // Inner chart margins (space reserved for axes and labels)
    margin: { top: 14, right: 10, bottom: 24, left: 40 },
    // White glow intensity for bars and axes (0 = none, 1 = full)
    glowOpacity: 0.05,
    /** Whether to render string name labels in per-string mode. */
    showStringLabels: true,
}

const NUM_BARS = 64
const STRING_LABELS = ["e", "B", "G", "D", "A", "E"]

// ── SVG helpers ──────────────────────────────────────────────────────────────
const SVG_NS = "http://www.w3.org/2000/svg"

function makeSvgEl<K extends keyof SVGElementTagNameMap>(
    tag: K,
    attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
    const el = document.createElementNS(SVG_NS, tag)
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v))
    return el
}

export class FrequencyPlotter {
    private container: HTMLElement
    private width: number
    private height: number
    private svg: any
    private compositeBars: any
    private stringBarGroups: any[] = []
    private laneYScales: d3.ScaleLinear<number, number>[] = []
    private yScale: d3.ScaleLinear<number, number>
    private margin = PLOT_CONFIG.margin
    private mode: FrequencyMode = "composite"
    private iconExpand!: SVGGElement
    private iconCollapse!: SVGGElement
    private lAxisPath: any
    private xAxisLabel: any
    private yAxisLabel: any

    constructor(
        containerSelector: string,
        width = PLOT_CONFIG.width,
        height = PLOT_CONFIG.height,
    ) {
        this.width = width
        this.height = height

        // Create or select container
        let container = document.querySelector(containerSelector)
        if (!container) {
            container = document.createElement("div")
            container.id = containerSelector.replace("#", "")
            document.body.appendChild(container)
        }
        this.container = container as HTMLElement

        // Container: flex row with icon on left, SVG on right
        Object.assign(this.container.style, {
            position: "absolute",
            top: PLOT_CONFIG.top,
            right: PLOT_CONFIG.right,
            zIndex: "10",
            display: "flex",
            flexDirection: "row",
            alignItems: "center",
            gap: "8px",
        })

        // ── Toggle icon ──────────────────────────────────────────────────────
        const iconSvg = this.buildToggleIcon()
        this.container.appendChild(iconSvg)

        // Create SVG
        this.svg = d3
            .select(this.container)
            .append("svg")
            .attr("width", this.width)
            .attr("height", this.height)
            .style("display", "block")

        const innerWidth = this.width - this.margin.left - this.margin.right
        const innerHeight = this.height - this.margin.top - this.margin.bottom

        // Y scale: FFT data is dBFS, normalized to 0–100 via (value + 100)
        this.yScale = d3.scaleLinear().domain([0, 100]).range([innerHeight, 0])

        // ── SVG filters ───────────────────────────────────────────────────────
        const defs = this.svg.append("defs")

        // White outer glow applied to the whole chart group
        const glowFilter = defs
            .append("filter")
            .attr("id", "plotGlow")
            .attr("x", "-40%")
            .attr("y", "-40%")
            .attr("width", "180%")
            .attr("height", "180%")
        glowFilter
            .append("feDropShadow")
            .attr("dx", 0)
            .attr("dy", 0)
            .attr("stdDeviation", 11)
            .attr("flood-color", "white")
            .attr("flood-opacity", PLOT_CONFIG.glowOpacity)

        // Dark inner shadow applied per-bar for depth
        const innerFilter = defs
            .append("filter")
            .attr("id", "barInner")
            .attr("x", "0")
            .attr("y", "0")
            .attr("width", "100%")
            .attr("height", "100%")
        innerFilter
            .append("feColorMatrix")
            .attr("in", "SourceAlpha")
            .attr("result", "alpha")
            .attr("type", "matrix")
            .attr("values", "0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 127 0")
        innerFilter
            .append("feGaussianBlur")
            .attr("in", "alpha")
            .attr("stdDeviation", 1)
            .attr("result", "blur")
        innerFilter
            .append("feComposite")
            .attr("in", "blur")
            .attr("in2", "alpha")
            .attr("operator", "arithmetic")
            .attr("k2", -1)
            .attr("k3", 1)
            .attr("result", "inner")
        innerFilter
            .append("feColorMatrix")
            .attr("in", "inner")
            .attr("result", "colored")
            .attr("type", "matrix")
            .attr("values", "0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.76 0")
        innerFilter
            .append("feBlend")
            .attr("in", "SourceGraphic")
            .attr("in2", "colored")
            .attr("mode", "normal")

        // Root group — white glow filter wraps bars + axis together
        const g = this.svg
            .append("g")
            .attr(
                "transform",
                `translate(${this.margin.left}, ${this.margin.top})`,
            )
            .attr("filter", "url(#plotGlow)")

        // ── Axis labels ──────────────────────────────────────────────────────

        // X axis label: "Frequency" centered below chart
        this.xAxisLabel = this.svg
            .append("text")
            .attr("x", this.margin.left + innerWidth / 2)
            .attr("y", this.height - 5)
            .attr("text-anchor", "middle")
            .attr("fill", "white")
            .attr("font-size", "12px")
            .attr("font-family", "Inconsolata, monospace")
            .text("Frequency")

        // Y axis label: "Amplitude (dB)" rotated on the left
        this.yAxisLabel = this.svg
            .append("text")
            .attr(
                "transform",
                `translate(22, ${this.margin.top + innerHeight / 2}) rotate(-90)`,
            )
            .attr("text-anchor", "middle")
            .attr("fill", "white")
            .attr("font-size", "12px")
            .attr("font-family", "Inconsolata, monospace")
            .text("Amplitude (dB)")

        // ── Composite bar group ───────────────────────────────────────────────
        this.compositeBars = g
            .selectAll(".bar-composite")
            .data(d3.range(NUM_BARS))
            .enter()
            .append("rect")
            .attr("class", "bar-composite")
            .attr("x", (_d: any, i: any) => (i / NUM_BARS) * innerWidth)
            .attr("width", innerWidth / NUM_BARS - 1)
            .attr("y", innerHeight)
            .attr("height", 0)
            .style("fill", (_d: any, i: any) => {
                // Grayscale ramp: dark gray at low freq, lighter at high
                const t = i / NUM_BARS
                const lightness = 25 + t * 40
                return `hsl(0, 0%, ${lightness}%)`
            })
            .style("filter", "url(#barInner)")

        // ── Per-string bar groups: 6 stacked lanes ───────────────────────────
        // Hidden by default; shown when mode = "per-string"
        const laneHeight = innerHeight / 6
        for (let i = 0; i < 6; i++) {
            // Per-lane Y scale: 0–100 normalized dB maps to lane height
            const laneYScale = d3
                .scaleLinear()
                .domain([0, 100])
                .range([laneHeight, 0])
            this.laneYScales[i] = laneYScale

            const laneGroup = g
                .append("g")
                .attr("class", `bar-string-${i + 1}`)
                .attr("transform", `translate(0, ${i * laneHeight})`)
                .style("display", "none")

            // String label in left margin
            if (PLOT_CONFIG.showStringLabels) {
                laneGroup
                    .append("text")
                    .attr("x", -(this.margin.left - 4))
                    .attr("y", laneHeight / 2)
                    .attr("dominant-baseline", "middle")
                    .attr("text-anchor", "start")
                    .attr("fill", STRING_WAVEFORM_COLORS[i])
                    .attr("font-size", "14px")
                    .attr("font-family", "Inconsolata, monospace")
                    .attr("pointer-events", "none")
                    .text(STRING_LABELS[i])
            }

            const bars = laneGroup
                .selectAll("rect")
                .data(d3.range(NUM_BARS))
                .enter()
                .append("rect")
                .attr("x", (_d: any, j: any) => (j / NUM_BARS) * innerWidth)
                .attr("width", innerWidth / NUM_BARS - 1)
                .attr("y", laneHeight)
                .attr("height", 0)
                .style("fill", STRING_WAVEFORM_COLORS[i])
                .style("opacity", 0.85)
                .style("filter", "url(#barInner)")

            this.stringBarGroups[i] = bars
        }

        // ── Glass L-axis (rendered on top of bars) ───────────────────────────
        // Single rounded L-path: Y arm + X arm joined seamlessly at the
        // bottom-left. AXIS_T = arm thickness, r = corner/cap radius.
        const AXIS_T = 4
        const r = 2
        const W = innerWidth
        const H = innerHeight
        const T = AXIS_T

        // Traced clockwise. Concave inner L corner uses sweep=0;
        // all convex corners and pill caps use sweep=1.
        const lPath = [
            `M 0 ${H - r}`,
            `A ${r} ${r} 0 0 0 ${r} ${H}`, // concave inner L corner
            `H ${W - r}`, // X arm inner edge
            `A ${r} ${r} 0 0 1 ${W} ${H + r}`, // right cap top
            `A ${r} ${r} 0 0 1 ${W - r} ${H + T}`, // right cap bottom
            `H ${-T + r}`, // X arm outer edge
            `A ${r} ${r} 0 0 1 ${-T} ${H + T - r}`, // outer bottom-left corner
            `V ${r}`, // Y arm outer edge
            `A ${r} ${r} 0 0 1 ${-T + r} 0`, // top cap left
            `A ${r} ${r} 0 0 1 0 ${r}`, // top cap right
            "Z",
        ].join(" ")

        this.lAxisPath = g
            .append("path")
            .attr("d", lPath)
            .style("fill", "rgba(168,168,168,0.2)")
            .style("pointer-events", "none")

        // Apply initial mode
        this.setMode(this.mode)
    }

    /**
     * Switch between composite (all-signal) and per-string frequency modes.
     */
    public setMode(mode: FrequencyMode): void {
        this.mode = mode
        const isPerString = mode === "per-string"

        // Swap toggle icons
        this.iconExpand.style.display = isPerString ? "none" : ""
        this.iconCollapse.style.display = isPerString ? "" : "none"

        // Show/hide the composite bars
        this.compositeBars.style("display", isPerString ? "none" : null)

        // Glass L-axis and axis labels only make sense in composite mode
        this.lAxisPath.style("display", isPerString ? "none" : null)
        this.xAxisLabel.style("display", isPerString ? "none" : null)
        this.yAxisLabel.style("display", isPerString ? "none" : null)

        // Show/hide all per-string lane groups
        for (let s = 1; s <= 6; s++) {
            this.svg
                .select(`.bar-string-${s}`)
                .style("display", isPerString ? null : "none")
        }
    }

    /**
     * Update bars with new FFT data from analyzer state.
     * In composite mode reads state.fftValues; in per-string mode reads
     * state.stringFftValues for each string.
     */
    public updateBars(state: AnalyzerState): void {
        const innerHeight = this.height - this.margin.top - this.margin.bottom

        if (this.mode === "composite") {
            const data = this.downsampleFFT(state.fftValues, NUM_BARS)
            this.compositeBars
                .data(data)
                .transition()
                .duration(50)
                .attr("y", (d: any) => this.yScale(d))
                .attr("height", (d: any) => innerHeight - this.yScale(d))
        } else {
            const laneHeight = innerHeight / 6
            for (let i = 0; i < 6; i++) {
                const fft = state.stringFftValues?.[i]
                if (!fft || fft.length === 0) continue
                const data = this.downsampleFFT(fft, NUM_BARS)
                const laneY = this.laneYScales[i]
                this.stringBarGroups[i]
                    .data(data)
                    .transition()
                    .duration(50)
                    .attr("y", (d: any) => laneY(d))
                    .attr("height", (d: any) => laneHeight - laneY(d))
            }
        }
    }

    // ── Icon construction ────────────────────────────────────────────────────

    /**
     * Build the toggle SVG with two swappable groups:
     *   iconExpand   – shown in composite mode  (click → per-string)
     *   iconCollapse – shown in per-string mode (click → composite)
     */
    private buildToggleIcon(): SVGSVGElement {
        const W = 18
        const H = 60
        const cx = W / 2
        const strokeAttrs = {
            stroke: "rgba(255,255,255,0.55)",
            "stroke-width": "1.5",
            "stroke-linecap": "round",
            "stroke-linejoin": "round",
            fill: "none",
        }

        const svg = makeSvgEl("svg", {
            width: W,
            height: H,
            viewBox: `0 0 ${W} ${H}`,
        })
        svg.style.cursor = "pointer"
        svg.style.flexShrink = "0"

        svg.addEventListener("mouseenter", () => {
            for (const g of [this.iconExpand, this.iconCollapse])
                g.setAttribute("stroke", "rgba(255,255,255,0.9)")
        })
        svg.addEventListener("mouseleave", () => {
            for (const g of [this.iconExpand, this.iconCollapse])
                g.setAttribute("stroke", "rgba(255,255,255,0.55)")
        })
        svg.addEventListener("click", () => {
            this.setMode(this.mode === "composite" ? "per-string" : "composite")
        })

        const midY = H / 2
        const chevH = 5
        const chevW = 5

        const makeLine = (parent: SVGGElement, y: number) => {
            parent.appendChild(
                makeSvgEl("line", { x1: 2, y1: y, x2: W - 2, y2: y }),
            )
        }

        // ── Expand group (composite → per-string) ────────────────────────────
        // 1 bar in the centre; outward chevrons (∧ above, ∨ below)
        const expTopY = 12
        const expBotY = H - 12
        this.iconExpand = makeSvgEl("g", strokeAttrs) as SVGGElement
        // Shown by default (composite is the default mode)
        makeLine(this.iconExpand, midY)
        this.iconExpand.appendChild(
            makeSvgEl("polyline", {
                points: `${cx - chevW},${expTopY + chevH} ${cx},${expTopY - chevH} ${cx + chevW},${expTopY + chevH}`,
            }),
        )
        this.iconExpand.appendChild(
            makeSvgEl("polyline", {
                points: `${cx - chevW},${expBotY - chevH} ${cx},${expBotY + chevH} ${cx + chevW},${expBotY - chevH}`,
            }),
        )
        svg.appendChild(this.iconExpand)

        // ── Collapse group (per-string → composite) ──────────────────────────
        // 3 bars clustered in the centre; inward chevrons (∨ above, ∧ below)
        const colTopY = 16
        const colBotY = H - 16
        this.iconCollapse = makeSvgEl("g", strokeAttrs) as SVGGElement
        this.iconCollapse.style.display = "none"
        makeLine(this.iconCollapse, midY - 4)
        makeLine(this.iconCollapse, midY)
        makeLine(this.iconCollapse, midY + 4)
        this.iconCollapse.appendChild(
            makeSvgEl("polyline", {
                points: `${cx - chevW},${colTopY - chevH} ${cx},${colTopY + chevH} ${cx + chevW},${colTopY - chevH}`,
            }),
        )
        this.iconCollapse.appendChild(
            makeSvgEl("polyline", {
                points: `${cx - chevW},${colBotY + chevH} ${cx},${colBotY - chevH} ${cx + chevW},${colBotY + chevH}`,
            }),
        )
        svg.appendChild(this.iconCollapse)

        return svg
    }

    /**
     * Downsample FFT data by averaging consecutive bins.
     * Input: dBFS Float32Array (typically –100 to 0).
     * Output: normalized values in the 0–100 range (–100 dBFS → 0, 0 dBFS → 100).
     */
    private downsampleFFT(
        fftValues: Float32Array,
        targetBins: number,
    ): number[] {
        const binSize = Math.ceil(fftValues.length / targetBins)
        const downsampled: number[] = []

        for (let i = 0; i < targetBins; i++) {
            const start = i * binSize
            const end = Math.min(start + binSize, fftValues.length)
            let sum = 0

            for (let j = start; j < end; j++) {
                // Normalize: dBFS + 100 maps –100 → 0, 0 → 100
                const normalized = Math.max(
                    0,
                    Math.min(100, fftValues[j] + 100),
                )
                sum += normalized
            }

            downsampled.push(sum / (end - start))
        }

        return downsampled
    }
}

