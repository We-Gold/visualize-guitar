import * as d3 from "d3"
import { GuitarVisualizer } from "./guitar-visualizer"
import type { JSONAudioFile } from "../audio/audio-modes"

const GUITAR_SVG_PATH = "./img/Guitar.svg"

export class Guitar {
    private container: HTMLElement
    private visualizer?: GuitarVisualizer
    private svgReadyCallbacks: Array<(svgEl: SVGElement) => void> = []
    private svgEl?: SVGElement

    constructor(container: HTMLElement, onclick?: () => void) {
        this.container = container
        if (onclick) {
            this.container.addEventListener("click", onclick)
        }
    }

    /** Register a callback that fires once the Guitar SVG has loaded and the visualizer is ready. */
    onSvgReady(cb: (svgEl: SVGElement) => void): void {
        if (this.svgEl) {
            cb(this.svgEl)
        } else {
            this.svgReadyCallbacks.push(cb)
        }
    }

    addGuitar() {
        d3.xml(GUITAR_SVG_PATH).then((xml) => {
            const svg = xml.documentElement
            svg.id = "guitar-svg"
            svg.style.zIndex = "1"

            // Remove static example elements before adding to DOM
            const d3Svg = d3.select(svg)
            d3Svg.select("#Fingers").remove()
            d3Svg.select("#Strum").remove()

            this.container.appendChild(svg)

            // Initialize visualizer after SVG is in the DOM
            this.visualizer = new GuitarVisualizer(svg as unknown as SVGElement)

            // Fire readiness callbacks
            this.svgEl = svg as unknown as SVGElement
            for (const cb of this.svgReadyCallbacks) cb(this.svgEl)
            this.svgReadyCallbacks = []
        })
    }

    /**
     * Load JSON audio file data into the visualizer
     */
    async load(
        jsonData: JSONAudioFile,
        durationMultiplier?: number,
    ): Promise<void> {
        if (this.visualizer) {
            await this.visualizer.load(jsonData, durationMultiplier)
        }
    }

    /**
     * Start the visualization, synced to the given play start time.
     */
    startVisualization(playStartTime: number): void {
        if (this.visualizer) {
            this.visualizer.start(playStartTime)
        }
    }

    /**
     * Update finger and strum visualizations based on current playback time.
     */
    updateVisuals(currentTime: number): void {
        if (this.visualizer) {
            this.visualizer.updateFingersAndStrum(currentTime)
        }
    }

    /**
     * Show static finger circles for the given placements (edit mode).
     */
    showStaticFingers(
        placements: Array<{ string: number; fret: number }>,
    ): void {
        if (this.visualizer) {
            this.visualizer.showStaticFingers(placements)
        }
    }

    /**
     * Clear all static finger indicators (exit edit mode).
     */
    clearStaticFingers(): void {
        if (this.visualizer) {
            this.visualizer.clearStaticFingers()
        }
    }

    /**
     * Stop the visualization and clear all indicators.
     */
    stopVisualization(): void {
        if (this.visualizer) {
            this.visualizer.stop()
        }
    }
}

