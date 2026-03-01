import * as d3 from "d3"
import type { AnalyzerState } from "../audio/audio-controller"
import { STRING_WAVEFORM_COLORS } from "./string-colors"

export type FrequencyMode = "composite" | "per-string"

// ── Plot configuration ───────────────────────────────────────────────────────
const PLOT_CONFIG = {
    width: 360,
    height: 250,
    // Position of the container within the page
    top: "50px",
    right: "20px",
    // Inner chart margins (space reserved for axes and labels)
    margin: { top: 14, right: 10, bottom: 24, left: 40 },
    // White glow intensity for bars and axes (0 = none, 1 = full)
    glowOpacity: 0.05,
}

const NUM_BARS = 64

export class FrequencyPlotter {
    private container: HTMLElement
    private width: number
    private height: number
    private svg: any
    private compositeBars: any
    private stringBarGroups: any[] = []
    private yScale: d3.ScaleLinear<number, number>
    private margin = PLOT_CONFIG.margin
    private mode: FrequencyMode = "composite"
    private toggleBtn!: HTMLButtonElement

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

        // Position container absolutely in top-right; relative so the button
        // can be absolutely placed inside it
        this.container.style.position = "absolute"
        this.container.style.top = PLOT_CONFIG.top
        this.container.style.right = PLOT_CONFIG.right
        this.container.style.zIndex = "10"

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
        this.svg
            .append("text")
            .attr("x", this.margin.left + innerWidth / 2)
            .attr("y", this.height - 5)
            .attr("text-anchor", "middle")
            .attr("fill", "white")
            .attr("font-size", "12px")
            .attr("font-family", "Inconsolata, monospace")
            .text("Frequency")

        // Y axis label: "Amplitude (dB)" rotated on the left
        this.svg
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
                // Red-to-amber scale: dark crimson at low freq, bright orange-red at high
                const t = i / NUM_BARS
                const hue = t * 28
                const saturation = 75 + t * 25
                const lightness = 22 + t * 33
                return `hsl(${hue}, ${saturation}%, ${lightness}%)`
            })
            .style("filter", "url(#barInner)")

        // ── Per-string bar groups (string 6 → 1 so string 1 renders on top) ──
        // Groups are hidden by default; shown when mode = "per-string"
        for (let s = 6; s >= 1; s--) {
            const stringGroup = g
                .append("g")
                .attr("class", `bar-string-${s}`)
                .style("display", "none")

            const bars = stringGroup
                .selectAll("rect")
                .data(d3.range(NUM_BARS))
                .enter()
                .append("rect")
                .attr("x", (_d: any, i: any) => (i / NUM_BARS) * innerWidth)
                .attr("width", innerWidth / NUM_BARS - 1)
                .attr("y", innerHeight)
                .attr("height", 0)
                .style("fill", STRING_WAVEFORM_COLORS[s - 1])
                .style("opacity", 0.55)
                .style("filter", "url(#barInner)")

            // Store in index order (0 = string 1) for easy access in updateBars
            this.stringBarGroups[s - 1] = bars
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

        g.append("path")
            .attr("d", lPath)
            .style("fill", "rgba(168,168,168,0.2)")
            .style("pointer-events", "none")

        // ── Mode toggle button (hidden; setMode() still works programmatically) ─
        this.toggleBtn = document.createElement("button")
        this.toggleBtn.textContent = "Per-string view"
        Object.assign(this.toggleBtn.style, {
            display: "none",
            position: "absolute",
            bottom: "6px",
            left: "6px",
            padding: "2px 7px",
            fontSize: "10px",
            fontFamily: "sans-serif",
            background: "rgba(255,255,255,0.12)",
            color: "rgba(255,255,255,0.75)",
            border: "1px solid rgba(255,255,255,0.25)",
            borderRadius: "3px",
            cursor: "pointer",
            zIndex: "1",
        })
        this.toggleBtn.addEventListener("click", () => {
            this.setMode(this.mode === "composite" ? "per-string" : "composite")
        })
        this.container.style.position = "absolute"
        this.container.appendChild(this.toggleBtn)

        // Apply initial mode
        this.setMode(this.mode)
    }

    /**
     * Switch between composite (all-signal) and per-string frequency modes.
     */
    public setMode(mode: FrequencyMode): void {
        this.mode = mode
        const isPerString = mode === "per-string"

        // Show/hide the composite bars
        this.compositeBars.style("display", isPerString ? "none" : null)

        // Show/hide all per-string groups
        for (let s = 1; s <= 6; s++) {
            this.svg
                .select(`.bar-string-${s}`)
                .style("display", isPerString ? null : "none")
        }

        this.toggleBtn.textContent = isPerString
            ? "Composite view"
            : "Per-string view"
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
            for (let i = 0; i < 6; i++) {
                const fft = state.stringFftValues?.[i]
                if (!fft || fft.length === 0) continue
                const data = this.downsampleFFT(fft, NUM_BARS)
                this.stringBarGroups[i]
                    .data(data)
                    .transition()
                    .duration(50)
                    .attr("y", (d: any) => this.yScale(d))
                    .attr("height", (d: any) => innerHeight - this.yScale(d))
            }
        }
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

