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

export type WaveformMode = "composite" | "per-string"

export class WaveformPlotter {
    private container: HTMLElement
    private canvas: HTMLCanvasElement
    private ctx: CanvasRenderingContext2D
    private width: number
    private height: number
    private innerWidth: number
    private innerHeight: number
    private laneHeight: number
    private margin = WAVEFORM_CONFIG.margin
    private dpr: number
    private fadeGradient: CanvasGradient
    private mode: WaveformMode = "per-string"
    private lastComposite: Float32Array | null = null
    private lastStringData: Float32Array[] = []
    private iconExpand!: SVGGElement
    private iconCollapse!: SVGGElement

    constructor(
        containerSelector: string,
        width = WAVEFORM_CONFIG.width,
        height = WAVEFORM_CONFIG.height,
    ) {
        this.width = width
        this.height = height
        this.innerWidth = width - this.margin.left - this.margin.right
        this.innerHeight = height - this.margin.top - this.margin.bottom
        this.laneHeight = this.innerHeight / 6

        // Create or select container
        let container = document.querySelector(containerSelector)
        if (!container) {
            container = document.createElement("div")
            container.id = containerSelector.replace("#", "")
            document.body.appendChild(container)
        }
        this.container = container as HTMLElement

        // Container becomes an absolute-positioned flex row (icon left, canvas right)
        Object.assign(this.container.style, {
            position: "absolute",
            bottom: "20px",
            right: "20px",
            zIndex: "10",
            display: "flex",
            flexDirection: "row",
            alignItems: "center",
            gap: "8px",
        })

        // ── Toggle icon ──────────────────────────────────────────────────────
        const iconSvg = this.buildToggleIcon()
        this.container.appendChild(iconSvg)

        // ── Canvas ───────────────────────────────────────────────────────────
        // Create canvas — scale by devicePixelRatio for sharp rendering on HiDPI
        this.dpr = window.devicePixelRatio || 1
        this.canvas = document.createElement("canvas")
        this.canvas.width = Math.round(width * this.dpr)
        this.canvas.height = Math.round(height * this.dpr)
        this.canvas.style.width = `${width}px`
        this.canvas.style.height = `${height}px`
        this.canvas.style.display = "block"
        this.canvas.style.borderRadius = "4px"
        this.container.appendChild(this.canvas)

        this.ctx = this.canvas.getContext("2d")!
        this.ctx.scale(this.dpr, this.dpr)

        // Build right-edge fade gradient once (in inner coordinate space)
        const fadeStart = this.innerWidth * (1 - WAVEFORM_CONFIG.fadePercent)
        this.fadeGradient = this.ctx.createLinearGradient(
            this.margin.left + fadeStart,
            0,
            this.margin.left + this.innerWidth,
            0,
        )
        this.fadeGradient.addColorStop(0, "rgba(0,0,0,0)") // transparent = no erase
        this.fadeGradient.addColorStop(1, "rgba(0,0,0,1)") // opaque = full erase

        // Initial draw so lines/labels are visible before any audio data arrives
        this.redraw()
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

        // Hover: bump opacity
        svg.addEventListener("mouseenter", () => {
            svg.style.opacity = "1"
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

        // ── Shared geometry ──────────────────────────────────────────────────
        const midY = H / 2 // vertical centre
        const chevH = 5 // half-height of chevron arms
        const chevW = 5 // horizontal half-width of chevron

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
        this.iconExpand.style.display = "none"
        makeLine(this.iconExpand, midY)
        // Top outward chevron (∧)
        this.iconExpand.appendChild(
            makeSvgEl("polyline", {
                points: `${cx - chevW},${expTopY + chevH} ${cx},${expTopY - chevH} ${cx + chevW},${expTopY + chevH}`,
            }),
        )
        // Bottom outward chevron (∨)
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
        makeLine(this.iconCollapse, midY - 4)
        makeLine(this.iconCollapse, midY)
        makeLine(this.iconCollapse, midY + 4)
        // Top inward chevron (∨, pointing toward centre)
        this.iconCollapse.appendChild(
            makeSvgEl("polyline", {
                points: `${cx - chevW},${colTopY - chevH} ${cx},${colTopY + chevH} ${cx + chevW},${colTopY - chevH}`,
            }),
        )
        // Bottom inward chevron (∧, pointing toward centre)
        this.iconCollapse.appendChild(
            makeSvgEl("polyline", {
                points: `${cx - chevW},${colBotY + chevH} ${cx},${colBotY - chevH} ${cx + chevW},${colBotY + chevH}`,
            }),
        )
        svg.appendChild(this.iconCollapse)

        return svg
    }

    // ── Private helpers ──────────────────────────────────────────────────────

    /**
     * Draw a waveform polyline from a Float32Array.
     * Caller is responsible for setting strokeStyle/lineWidth before calling.
     * @param data  Samples in the range [-1, 1]
     * @param midY  Vertical midpoint of the draw area (in current transform space)
     * @param amplitude  Half the total draw height in pixels
     */
    private drawWaveformLine(
        data: Float32Array,
        midY: number,
        amplitude: number,
    ): void {
        const ctx = this.ctx
        const len = data.length
        const xStep = this.innerWidth / (len - 1)

        ctx.beginPath()
        for (let i = 0; i < len; i++) {
            const x = i * xStep
            const y = midY - data[i] * amplitude
            if (i === 0) ctx.moveTo(x, y)
            else ctx.lineTo(x, y)
        }
        ctx.stroke()
    }

    /**
     * Apply the right-edge fade by erasing with the pre-built gradient.
     * Must be called while the context transform is at the root (no translate).
     */
    private applyFade(): void {
        const ctx = this.ctx
        ctx.save()
        ctx.globalCompositeOperation = "destination-out"
        ctx.fillStyle = this.fadeGradient
        ctx.fillRect(0, 0, this.width, this.height)
        ctx.restore()
    }

    private redraw(): void {
        const ctx = this.ctx
        const { margin, innerHeight, laneHeight } = this

        ctx.clearRect(0, 0, this.width, this.height)

        ctx.save()
        ctx.translate(margin.left, margin.top)

        if (this.mode === "composite") {
            // Ghost per-string signals behind the composite line
            ctx.lineWidth = 1
            ctx.lineJoin = "round"
            ctx.lineCap = "round"
            ctx.globalAlpha = 0.3
            for (let i = 0; i < 6; i++) {
                const data = this.lastStringData[i]
                ctx.strokeStyle = STRING_WAVEFORM_COLORS[i]
                if (data && data.length > 0) {
                    this.drawWaveformLine(
                        data,
                        innerHeight / 2,
                        innerHeight / 2,
                    )
                } else {
                    ctx.beginPath()
                    ctx.moveTo(0, innerHeight / 2)
                    ctx.lineTo(this.innerWidth, innerHeight / 2)
                    ctx.stroke()
                }
            }
            ctx.globalAlpha = 1

            // Composite signal on top
            if (this.lastComposite && this.lastComposite.length > 0) {
                ctx.strokeStyle = "rgba(255, 255, 255, 0.93)"
                ctx.lineWidth = 2
                ctx.lineJoin = "round"
                ctx.lineCap = "round"
                this.drawWaveformLine(
                    this.lastComposite,
                    innerHeight / 2,
                    innerHeight / 2,
                )
            }
        } else {
            // Per-string: 6 stacked lanes, string 1 (e) at top
            for (let i = 0; i < 6; i++) {
                const data = this.lastStringData[i]

                ctx.save()
                ctx.translate(0, i * laneHeight)

                // String label (drawn in left margin, outside the fade region)
                if (WAVEFORM_CONFIG.showStringLabels) {
                    ctx.fillStyle = STRING_WAVEFORM_COLORS[i]
                    ctx.font = "14px Inconsolata, monospace"
                    ctx.textBaseline = "middle"
                    ctx.textAlign = "left"
                    ctx.fillText(
                        STRING_LABELS[i],
                        -(margin.left - 4),
                        laneHeight / 2,
                    )
                }

                ctx.strokeStyle = STRING_WAVEFORM_COLORS[i]
                ctx.lineWidth = 1.2
                ctx.lineJoin = "round"
                ctx.lineCap = "round"
                ctx.globalAlpha = 0.85

                if (data && data.length > 0) {
                    this.drawWaveformLine(data, laneHeight / 2, laneHeight / 2)
                } else {
                    // No data yet — flat midline so lanes are visible before playback
                    ctx.beginPath()
                    ctx.moveTo(0, laneHeight / 2)
                    ctx.lineTo(this.innerWidth, laneHeight / 2)
                    ctx.stroke()
                }

                ctx.globalAlpha = 1
                ctx.restore()
            }
        }

        ctx.restore()

        // Fade must be applied in root space (gradient uses absolute coordinates)
        this.applyFade()
    }

    // ── Public API ───────────────────────────────────────────────────────────

    /**
     * Switch between composite and per-string display modes.
     * Redraws immediately using the most recently received data.
     */
    public setMode(mode: WaveformMode): void {
        this.mode = mode
        const isPerString = mode === "per-string"
        this.iconExpand.style.display = isPerString ? "none" : ""
        this.iconCollapse.style.display = isPerString ? "" : "none"
        this.redraw()
    }

    /**
     * Update the main composite waveform (all strings mixed).
     */
    public updateWaveform(state: AnalyzerState): void {
        this.lastComposite = state.waveformValues
        if (this.mode === "composite") this.redraw()
    }

    /**
     * Update the 6 per-string waveform paths.
     * stringWaveformValues[0] = string 1 (high E), [5] = string 6 (low E).
     */
    public updateStringWaveforms(stringWaveformValues: Float32Array[]): void {
        this.lastStringData = stringWaveformValues
        this.redraw()
    }
}

