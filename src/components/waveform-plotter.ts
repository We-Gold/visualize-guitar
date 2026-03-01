import * as d3 from "d3"
import type { AnalyzerState } from "../audio/audio-controller"
import { STRING_WAVEFORM_COLORS } from "./string-colors"

// ── Plot configuration ───────────────────────────────────────────────────────
const WAVEFORM_CONFIG = {
    width: 520,
    height: 260,
    margin: { top: 10, right: 10, bottom: 10, left: 28 },
    /** Fraction of inner width over which the right edge fades to transparent (0–1). */
    fadePercent: 0.75,
    /** Whether to render string name labels (e / B / G / D / A / E) in per-string mode. */
    showStringLabels: true,
}

const STRING_LABELS = ["e", "B", "G", "D", "A", "E"]

export type WaveformMode = "composite" | "per-string"

export class WaveformPlotter {
    private container: HTMLElement
    private width: number
    private height: number
    private svg: any
    private path: any
    private stringPaths: any[] = []
    private stringGroups: any[] = []
    private line: any
    private stringLine: any
    private xScale: d3.ScaleLinear<number, number>
    private yScale: d3.ScaleLinear<number, number>
    private margin = WAVEFORM_CONFIG.margin
    private mode: WaveformMode = "composite"

    constructor(
        containerSelector: string,
        width = WAVEFORM_CONFIG.width,
        height = WAVEFORM_CONFIG.height,
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

        // Position container absolutely below frequency plot
        this.container.style.position = "absolute"
        this.container.style.bottom = "20px"
        this.container.style.right = "20px"
        this.container.style.zIndex = "10"

        // Create SVG (no border)
        this.svg = d3
            .select(this.container)
            .append("svg")
            .attr("width", this.width)
            .attr("height", this.height)
            .style("background", "rgba(0, 0, 0, 0.8)")
            .style("border-radius", "4px")

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

        // Per-lane y-scale for per-string mode (each lane gets its own [-1,1] range)
        const laneHeight = innerHeight / 6
        const laneYScale = d3
            .scaleLinear()
            .domain([-1, 1])
            .range([laneHeight, 0])

        // Composite line generator (full inner height)
        this.line = d3
            .line<number>()
            .x((_d: any, i: any) => this.xScale(i))
            .y((d: any) => this.yScale(d))

        // Per-string line generator (lane-local coordinates)
        this.stringLine = d3
            .line<number>()
            .x((_d: any, i: any) => this.xScale(i))
            .y((d: any) => laneYScale(d))

        // ── SVG defs: right-edge fade gradient + mask ────────────────────────
        const defs = this.svg.append("defs")

        const solidStop = `${((1 - WAVEFORM_CONFIG.fadePercent) * 100).toFixed(1)}%`

        const fadeGrad = defs
            .append("linearGradient")
            .attr("id", "waveformFade")
            .attr("x1", "0%")
            .attr("y1", "0%")
            .attr("x2", "100%")
            .attr("y2", "0%")
        fadeGrad
            .append("stop")
            .attr("offset", "0%")
            .attr("stop-color", "white")
            .attr("stop-opacity", 1)
        fadeGrad
            .append("stop")
            .attr("offset", solidStop)
            .attr("stop-color", "white")
            .attr("stop-opacity", 1)
        fadeGrad
            .append("stop")
            .attr("offset", "100%")
            .attr("stop-color", "white")
            .attr("stop-opacity", 0)

        defs.append("mask")
            .attr("id", "waveformFadeMask")
            .append("rect")
            .attr("x", 0)
            .attr("y", 0)
            .attr("width", innerWidth)
            .attr("height", innerHeight)
            .attr("fill", "url(#waveformFade)")

        // ── Main group (masked) ──────────────────────────────────────────────
        const g = this.svg
            .append("g")
            .attr(
                "transform",
                `translate(${this.margin.left}, ${this.margin.top})`,
            )
            .attr("mask", "url(#waveformFadeMask)")

        // ── Per-string lane groups (string 1 = top, string 6 = bottom) ───────
        for (let i = 0; i < 6; i++) {
            const group = g
                .append("g")
                .attr("class", `waveform-string-group-${i + 1}`)
                .attr("transform", `translate(0, ${i * laneHeight})`)
                .style("display", "none")

            // String label (positioned to the left of the masked area)
            group
                .append("text")
                .attr("class", "waveform-string-label")
                .attr("x", -(this.margin.left - 4))
                .attr("y", laneHeight / 2)
                .attr("dominant-baseline", "middle")
                .attr("text-anchor", "start")
                .attr("fill", STRING_WAVEFORM_COLORS[i])
                .attr("font-size", "11px")
                .attr("font-family", "Inconsolata, monospace")
                .style(
                    "display",
                    WAVEFORM_CONFIG.showStringLabels ? null : "none",
                )
                .text(STRING_LABELS[i])

            const stringPath = group
                .append("path")
                .attr("class", `waveform-string-${i + 1}`)
                .style("fill", "none")
                .style("stroke", STRING_WAVEFORM_COLORS[i])
                .style("stroke-width", 1.2)
                .style("stroke-linecap", "round")
                .style("stroke-linejoin", "round")
                .style("opacity", 0.85)

            this.stringGroups.push(group)
            this.stringPaths.push(stringPath)
        }

        // ── Composite waveform path (rendered on top, visible by default) ────
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
     * Switch between composite and per-string display modes.
     * Composite shows a single mixed waveform; per-string shows
     * 6 vertically-stacked labeled lanes (e → E, guitar order).
     */
    public setMode(mode: WaveformMode): void {
        this.mode = mode
        const isPerString = this.mode === "per-string"

        this.path.style("display", isPerString ? "none" : null)

        for (let i = 0; i < this.stringGroups.length; i++) {
            this.stringGroups[i].style("display", isPerString ? null : "none")
        }
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
                .attr("d", this.stringLine(Array.from(data)))
        }
    }
}

