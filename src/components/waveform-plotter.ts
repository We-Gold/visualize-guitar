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
    private mode: WaveformMode = "composite"
    private lastComposite: Float32Array | null = null
    private lastStringData: Float32Array[] = []

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

        // Position container
        this.container.style.position = "absolute"
        this.container.style.bottom = "20px"
        this.container.style.right = "20px"
        this.container.style.zIndex = "10"

        // Create canvas — scale by devicePixelRatio for sharp rendering on HiDPI
        this.dpr = window.devicePixelRatio || 1
        this.canvas = document.createElement("canvas")
        this.canvas.width = Math.round(width * this.dpr)
        this.canvas.height = Math.round(height * this.dpr)
        this.canvas.style.width = `${width}px`
        this.canvas.style.height = `${height}px`
        this.canvas.style.display = "block"
        this.canvas.style.background = "rgba(0, 0, 0, 0.8)"
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

                // String label (drawn outside the fade region, in left margin)
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
                    // No data yet — draw a flat midline so lanes are visible before playback starts
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
        if (this.mode === "per-string") this.redraw()
    }
}

