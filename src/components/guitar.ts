import * as d3 from "d3"
import { GuitarVisualizer } from "./guitar-visualizer"
import type { JSONAudioFile } from "../audio/audio-modes"

const GUITAR_SVG_PATH = "./img/Guitar.svg"

export class Guitar {
    private container: HTMLElement
    private visualizer?: GuitarVisualizer

    constructor(container: HTMLElement, onclick?: () => void) {
        this.container = container
        if (onclick) {
            this.container.addEventListener("click", onclick)
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
        })
    }

    /**
     * Load JSON audio file data into the visualizer
     */
    async load(jsonData: JSONAudioFile): Promise<void> {
        if (this.visualizer) {
            await this.visualizer.load(jsonData)
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
}

