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
    /** Whether to render string name labels in per-string mode. */
    showStringLabels: true,
}

const NUM_BARS = 64
// Labels ordered top→bottom: string 6 (low E) at top, string 1 (high e) at bottom
const STRING_LABELS = ["E", "A", "D", "G", "B", "e"]

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
    private canvas!: HTMLCanvasElement
    private ctx!: CanvasRenderingContext2D
    private dpr: number = 1
    private lastFft: Float32Array | null = null
    private lastStringFft: (Float32Array | null)[] = Array(6).fill(null)
    private margin = PLOT_CONFIG.margin
    private mode: FrequencyMode = "per-string"
    private iconExpand!: SVGGElement
    private iconCollapse!: SVGGElement

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

        // ── Canvas ────────────────────────────────────────────────────────────
        this.dpr = window.devicePixelRatio || 1
        this.canvas = document.createElement("canvas")
        this.canvas.width = Math.round(this.width * this.dpr)
        this.canvas.height = Math.round(this.height * this.dpr)
        this.canvas.style.width = `${this.width}px`
        this.canvas.style.height = `${this.height}px`
        this.canvas.style.borderRadius = "4px"
        this.container.appendChild(this.canvas)
        this.ctx = this.canvas.getContext("2d")!
        this.ctx.scale(this.dpr, this.dpr)

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

        if (isPerString) this.redrawCanvas()
        else this.redrawComposite()
    }

    /**
     * Update bars with new FFT data from analyzer state.
     * In composite mode reads state.fftValues; in per-string mode reads
     * state.stringFftValues for each string.
     */
    public updateBars(state: AnalyzerState): void {
        if (this.mode === "composite") {
            this.lastFft = state.fftValues
            this.redrawComposite()
        } else {
            for (let i = 0; i < 6; i++) {
                const fft = state.stringFftValues?.[i]
                this.lastStringFft[i] = fft && fft.length > 0 ? fft : null
            }
            this.redrawCanvas()
        }
    }

    // ── Canvas composite rendering ────────────────────────────────────────────

    private redrawComposite(): void {
        const { ctx, width, height, margin } = this
        const innerWidth = width - margin.left - margin.right
        const innerHeight = height - margin.top - margin.bottom
        const barW = innerWidth / NUM_BARS

        ctx.clearRect(0, 0, width, height)
        ctx.save()
        ctx.translate(margin.left, margin.top)

        // Bars with grayscale ramp: dark gray at low freq, lighter at high
        ctx.globalAlpha = 0.85
        const fft = this.lastFft
        if (fft) {
            const data = this.downsampleFFT(fft, NUM_BARS)
            for (let j = 0; j < NUM_BARS; j++) {
                const t = j / NUM_BARS
                const lightness = 25 + t * 40
                ctx.fillStyle = `hsl(0, 0%, ${lightness}%)`
                const barH = (data[j] / 100) * innerHeight
                ctx.fillRect(j * barW, innerHeight - barH, barW - 1, barH)
            }
        }
        ctx.globalAlpha = 1

        ctx.restore()

        // ── Axis titles ───────────────────────────────────────────────────────
        ctx.fillStyle = "white"
        ctx.font = "12px Inconsolata, monospace"

        // Bottom: "Frequency" centered below the chart area
        ctx.textAlign = "center"
        ctx.textBaseline = "bottom"
        ctx.fillText("Frequency", margin.left + innerWidth / 2, height - 5)

        // Right: "Amplitude (dB)" rotated, aligned to the right edge
        ctx.save()
        ctx.translate(width - 8, margin.top + innerHeight / 2)
        ctx.rotate(Math.PI / 2)
        ctx.textAlign = "center"
        ctx.textBaseline = "top"
        ctx.fillText("Amplitude (dB)", 0, 0)
        ctx.restore()
    }

    // ── Canvas per-string rendering ──────────────────────────────────────────

    private redrawCanvas(): void {
        const { ctx, width, height, margin } = this
        const innerWidth = width - margin.left - margin.right
        const innerHeight = height - margin.top - margin.bottom
        const laneHeight = innerHeight / 6
        const barW = innerWidth / NUM_BARS

        ctx.clearRect(0, 0, width, height)
        ctx.save()
        ctx.translate(margin.left, margin.top)

        for (let i = 0; i < 6; i++) {
            // si maps lane index to string data index: lane 0 (top) = string 6 (low E), lane 5 (bottom) = string 1 (high e)
            const si = 5 - i
            ctx.save()
            ctx.translate(0, i * laneHeight)

            // String label in left margin — baseline-aligned with bar bottom
            if (PLOT_CONFIG.showStringLabels) {
                ctx.fillStyle = STRING_WAVEFORM_COLORS[si]
                ctx.font = "14px Inconsolata, monospace"
                ctx.textBaseline = "bottom"
                ctx.textAlign = "left"
                ctx.fillText(
                    STRING_LABELS[i],
                    -(margin.left - 4),
                    laneHeight - 3,
                )
            }

            // Bars
            ctx.fillStyle = STRING_WAVEFORM_COLORS[si]
            ctx.globalAlpha = 0.85
            const fft = this.lastStringFft[si]
            if (fft) {
                const data = this.downsampleFFT(fft, NUM_BARS)
                for (let j = 0; j < NUM_BARS; j++) {
                    const barH = (data[j] / 100) * laneHeight
                    ctx.fillRect(j * barW, laneHeight - barH, barW - 1, barH)
                }
            }
            // No data yet — draw nothing; canvas stays dark
            ctx.globalAlpha = 1

            ctx.restore()
        }

        ctx.restore()

        // ── Axis titles ───────────────────────────────────────────────────────
        ctx.fillStyle = "white"
        ctx.font = "12px Inconsolata, monospace"

        // Bottom: "Frequency" centered below the chart area
        ctx.textAlign = "center"
        ctx.textBaseline = "bottom"
        ctx.fillText("Frequency", margin.left + innerWidth / 2, height - 5)

        // Right: "Amplitude (dB)" rotated, aligned to the right edge
        ctx.save()
        ctx.translate(width - 8, margin.top + innerHeight / 2)
        ctx.rotate(Math.PI / 2)
        ctx.textAlign = "center"
        ctx.textBaseline = "top"
        ctx.fillText("Amplitude (dB)", 0, 0)
        ctx.restore()
    }

    // ── Icon construction ──────────────────────────────────────────────────

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

