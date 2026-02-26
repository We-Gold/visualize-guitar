import * as d3 from "d3"
import type { AnalyzerState } from "../audio/audio-controller"
import { STRING_CONFIGS } from "./string-animator"

/**
 * Colors for each guitar string derived from the SVG string gradient's base color.
 * Index 0 = string 1 (high E), index 5 = string 6 (low E).
 * Uses colors[2] — the mid-tone of the 5-stop metallic gradient — which is the
 * most distinctive, perceptually representative color for each string.
 */
const STRING_WAVEFORM_COLORS = Array.from(
    { length: 6 },
    (_, i) => STRING_CONFIGS[i + 1].colors[2],
)

export class WaveformPlotter {
    private container: HTMLElement
    private width: number
    private height: number
    private svg: any
    private path: any
    private stringPaths: any[] = []
    private line: any
    private xScale: d3.ScaleLinear<number, number>
    private yScale: d3.ScaleLinear<number, number>
    private margin = { top: 10, right: 10, bottom: 10, left: 10 }

    constructor(containerSelector: string, width = 400, height = 150) {
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

        // Position container absolutely below frequency plot
        this.container.style.position = "absolute"
        this.container.style.bottom = "20px"
        this.container.style.right = "20px"
        this.container.style.zIndex = "10"

        // Create SVG
        this.svg = d3
            .select(this.container)
            .append("svg")
            .attr("width", this.width)
            .attr("height", this.height)
            .style("background", "rgba(0, 0, 0, 0.8)")
            .style("border-radius", "4px")
            .style("border", "1px solid rgba(255, 255, 255, 0.3)")

        // Create scales
        const innerWidth = this.width - this.margin.left - this.margin.right
        const innerHeight = this.height - this.margin.top - this.margin.bottom

        this.xScale = d3
            .scaleLinear()
            .domain([0, 512]) // Waveform analyzer size
            .range([0, innerWidth])

        this.yScale = d3
            .scaleLinear()
            .domain([-1, 1]) // Waveform data range
            .range([innerHeight, 0])

        // Create line generator
        this.line = d3
            .line<number>()
            .x((_d: any, i: any) => this.xScale(i))
            .y((d: any) => this.yScale(d))

        // Create group for path
        const g = this.svg
            .append("g")
            .attr(
                "transform",
                `translate(${this.margin.left}, ${this.margin.top})`,
            )

        // Initialize per-string waveform paths (one per string, color-coded)
        for (let i = 0; i < 6; i++) {
            const stringPath = g
                .append("path")
                .attr("class", `waveform-string-${i + 1}`)
                .style("fill", "none")
                .style("stroke", STRING_WAVEFORM_COLORS[i])
                .style("stroke-width", 1.2)
                .style("stroke-linecap", "round")
                .style("stroke-linejoin", "round")
                .style("opacity", 0.85)
            this.stringPaths.push(stringPath)
        }

        // Initialize main composite waveform path on top (sum of all strings)
        this.path = g
            .append("path")
            .attr("class", "waveform-path")
            .style("fill", "none")
            .style("stroke", "rgba(255, 255, 255, 0.93)")
            .style("stroke-width", 2)
            .style("stroke-linecap", "round")
            .style("stroke-linejoin", "round")
    }

    /**
     * Update the main composite waveform (all strings mixed).
     */
    public updateWaveform(state: AnalyzerState): void {
        const waveformData = Array.from(state.waveformValues)

        this.path
            .transition()
            .duration(50) // Smooth 50ms transition
            .attr("d", this.line(waveformData))
    }

    /**
     * Update the 6 per-string waveform paths.
     * stringWaveformValues[0] = string 1 (high E), [5] = string 6 (low E).
     */
    public updateStringWaveforms(stringWaveformValues: Float32Array[]): void {
        for (let i = 0; i < this.stringPaths.length; i++) {
            const data = stringWaveformValues[i]
            if (!data || data.length === 0) continue
            this.stringPaths[i]
                .transition()
                .duration(50)
                .attr("d", this.line(Array.from(data)))
        }
    }
}

