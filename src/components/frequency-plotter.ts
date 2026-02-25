import * as d3 from "d3"
import type { AnalyzerState } from "../audio/audio-controller"

export class FrequencyPlotter {
    private container: HTMLElement
    private width: number
    private height: number
    private svg: any
    private bars: any
    private yScale: d3.ScaleLinear<number, number>
    private margin = { top: 10, right: 10, bottom: 10, left: 10 }

    constructor(containerSelector: string, width = 300, height = 180) {
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

        // Position container absolutely in top-right
        this.container.style.position = "absolute"
        this.container.style.top = "20px"
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

        this.yScale = d3
            .scaleLinear()
            .domain([0, 255]) // Float frequency data range
            .range([innerHeight, 0])

        // Create group for bars
        const g = this.svg
            .append("g")
            .attr(
                "transform",
                `translate(${this.margin.left}, ${this.margin.top})`,
            )

        // Initialize empty bars (will be populated on first update)
        const numBars = 64 // Downsample to 64 bars from 256 FFT bins
        this.bars = g
            .selectAll(".bar")
            .data(d3.range(numBars))
            .enter()
            .append("rect")
            .attr("class", "bar")
            .attr("x", (_d: any, i: any) => (i / numBars) * innerWidth)
            .attr("width", innerWidth / numBars - 1)
            .attr("y", innerHeight)
            .attr("height", 0)
            .style("fill", (_d: any, i: any) => {
                // Gradient from blue (low freq) to red (high freq)
                const hue = (1 - i / numBars) * 240 // 240 to 0 degrees (blue to red)
                return `hsl(${hue}, 100%, 50%)`
            })
    }

    /**
     * Update bars with new FFT data from analyzer state
     * Uses D3 transitions for smooth animation
     */
    public updateBars(state: AnalyzerState): void {
        const numBars = 64
        const fftValues = state.fftValues

        // Downsample FFT data: average bins into 64 bars
        const downsampledData = this.downsampleFFT(fftValues, numBars)

        const innerHeight = this.height - this.margin.top - this.margin.bottom

        this.bars
            .data(downsampledData)
            .transition()
            .duration(50) // Smooth 50ms transition
            .attr("y", (d: any) => this.yScale(d))
            .attr("height", (d: any) => innerHeight - this.yScale(d))
    }

    /**
     * Downsample FFT data by averaging consecutive bins
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
                // Normalize frequency data to 0-255 range
                const normalized = Math.max(
                    0,
                    Math.min(255, fftValues[j] + 100),
                )
                sum += normalized
            }

            const avg = sum / (end - start)
            downsampled.push(avg)
        }

        return downsampled
    }
}

