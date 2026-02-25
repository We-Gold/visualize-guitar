import * as d3 from "d3"
import type { AnalyzerState } from "../audio/audio-controller"

export class WaveformPlotter {
    private container: HTMLElement
    private width: number
    private height: number
    private svg: any
    private path: any
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
        this.container.style.top = "230px"
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
            .style("border", "1px solid rgba(0, 255, 255, 0.3)")

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

        // Initialize empty path
        this.path = g
            .append("path")
            .attr("class", "waveform-path")
            .style("fill", "none")
            .style("stroke", "#00ffff")
            .style("stroke-width", 1.5)
            .style("stroke-linecap", "round")
            .style("stroke-linejoin", "round")
    }

    /**
     * Update waveform path with new time-domain data from analyzer state
     * Uses D3 transitions for smooth animation
     */
    public updateWaveform(state: AnalyzerState): void {
        const waveformData = Array.from(state.waveformValues)

        this.path
            .transition()
            .duration(50) // Smooth 50ms transition
            .attr("d", this.line(waveformData))
    }
}

