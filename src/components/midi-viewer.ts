import type { JSONAudioFile } from "../audio/audio-modes"
import type { NoteWithKey } from "./guitar-visualizer"
import { STRING_WAVEFORM_COLORS } from "./string-colors"
import { makeSvgEl } from "../utils/svg"

// ── Configuration ─────────────────────────────────────────────────────────────
const MIDI_VIEWER_CONFIG = {
    width: 520,
    height: 260,
    margin: { top: 10, right: 10, bottom: 10, left: 28 },
    /** Total seconds visible in the viewport. */
    secondsVisible: 8,
    /** Fraction of inner width that represents "now" (0 = far left, 1 = far right). */
    nowFraction: 0.35,
    /** Fraction of inner width over which the left edge fades. */
    fadeLeftPercent: 0.15,
    /** Fraction of inner width over which the right edge fades (from right). */
    fadeRightPercent: 0.18,
    /** Minimum note rect height in pixels (CSS). */
    minNoteHeight: 5,
    /** Maximum note rect height in pixels (CSS). */
    maxNoteHeight: 20,
    /** Corner radius for note rects. */
    noteRadius: 3,
    /** Minimum note rect width (px) to show text label inside. */
    minWidthForLabel: 30,
    /** Padding in semitones above/below the pitch range. */
    pitchPadding: 2,
}

export class MidiViewer {
    private container: HTMLElement
    private wrapper: HTMLElement
    private canvas: HTMLCanvasElement
    private ctx: CanvasRenderingContext2D
    private width: number
    private height: number
    private innerWidth: number
    private innerHeight: number
    private margin = MIDI_VIEWER_CONFIG.margin
    private dpr: number

    private notes: NoteWithKey[] = []
    private midiMin = 40
    private midiMax = 76
    private playStartTime: number | null = null
    private pxPerSec: number

    // Gradients for left & right edge fades (built once in constructor)
    private fadeLeftGradient!: CanvasGradient
    private fadeRightGradient!: CanvasGradient

    private onToggleCb: (() => void) | null = null

    constructor(
        appContainer: HTMLElement,
        width = MIDI_VIEWER_CONFIG.width,
        height = MIDI_VIEWER_CONFIG.height,
    ) {
        this.width = width
        this.height = height
        this.innerWidth = width - this.margin.left - this.margin.right
        this.innerHeight = height - this.margin.top - this.margin.bottom
        this.pxPerSec = this.innerWidth / MIDI_VIEWER_CONFIG.secondsVisible

        // ── Outer wrapper mirrors WaveformPlotter's container positioning ──────
        this.wrapper = document.createElement("div")
        this.wrapper.id = "midi-viewer"
        Object.assign(this.wrapper.style, {
            position: "absolute",
            bottom: "20px",
            right: "20px",
            zIndex: "10",
            display: "none", // hidden by default
            flexDirection: "column",
            alignItems: "center",
            gap: "4px",
        })
        appContainer.appendChild(this.wrapper)

        this.container = this.wrapper

        // ── Label ─────────────────────────────────────────────────────────────
        const label = document.createElement("div")
        label.textContent = "Notes"
        const nowBarX =
            this.margin.left + this.innerWidth * MIDI_VIEWER_CONFIG.nowFraction
        Object.assign(label.style, {
            color: "rgba(255,255,255,0.45)",
            fontFamily: "Inconsolata, monospace",
            fontSize: "12px",
            letterSpacing: "0.06em",
            userSelect: "none",
            alignSelf: "flex-start",
            marginLeft: `${nowBarX}px`,
            transform: "translateX(-50%)",
        })
        this.wrapper.appendChild(label)

        // ── Inner row (canvas + icon) ──────────────────────────────────────────
        const row = document.createElement("div")
        Object.assign(row.style, {
            display: "flex",
            flexDirection: "row",
            alignItems: "center",
            gap: "8px",
        })
        this.wrapper.appendChild(row)
        this.container = row

        // ── Canvas ────────────────────────────────────────────────────────────
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

        // ── Sine-wave toggle icon (right side, switches back to waveform) ─────
        const iconSvg = this.buildSineIcon()
        this.container.appendChild(iconSvg)

        // ── Build fade gradients ───────────────────────────────────────────────
        this.buildFadeGradients()

        // Initial empty draw
        this.redraw(null)
    }

    // ── Icon ──────────────────────────────────────────────────────────────────

    private buildSineIcon(): SVGSVGElement {
        const W = 18
        const H = 60

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
            g.setAttribute("stroke", "rgba(255,255,255,0.9)")
        })
        svg.addEventListener("mouseleave", () => {
            g.setAttribute("stroke", "rgba(255,255,255,0.55)")
        })
        svg.addEventListener("click", () => {
            if (this.onToggleCb) this.onToggleCb()
        })

        const g = makeSvgEl("g", strokeAttrs) as SVGGElement

        // Sine wave path: one full period centred in the icon
        // Spans y: 10 → 50, amplitude ≈ 14px around centre y=30
        const cx = W / 2
        const midY = H / 2
        const amp = 14
        const steps = 32
        const points: string[] = []
        for (let i = 0; i <= steps; i++) {
            const t = i / steps // 0→1
            const x = 2 + t * (W - 4)
            const y = midY - Math.sin(t * 2 * Math.PI) * amp
            points.push(`${x.toFixed(2)},${y.toFixed(2)}`)
        }

        g.appendChild(
            makeSvgEl("polyline", {
                points: points.join(" "),
            }),
        )

        // Small horizontal tick marks top and bottom to frame the icon
        g.appendChild(
            makeSvgEl("line", { x1: cx - 3, y1: 8, x2: cx + 3, y2: 8 }),
        )
        g.appendChild(
            makeSvgEl("line", { x1: cx - 3, y1: H - 8, x2: cx + 3, y2: H - 8 }),
        )

        svg.appendChild(g)
        return svg
    }

    // ── Gradients ─────────────────────────────────────────────────────────────

    private buildFadeGradients(): void {
        const { margin, innerWidth } = this

        const leftEnd =
            margin.left + innerWidth * MIDI_VIEWER_CONFIG.fadeLeftPercent
        this.fadeLeftGradient = this.ctx.createLinearGradient(
            margin.left,
            0,
            leftEnd,
            0,
        )
        this.fadeLeftGradient.addColorStop(0, "rgba(0,0,0,1)") // full erase at left edge
        this.fadeLeftGradient.addColorStop(1, "rgba(0,0,0,0)") // no erase

        const rightStart =
            margin.left + innerWidth * (1 - MIDI_VIEWER_CONFIG.fadeRightPercent)
        this.fadeRightGradient = this.ctx.createLinearGradient(
            rightStart,
            0,
            margin.left + innerWidth,
            0,
        )
        this.fadeRightGradient.addColorStop(0, "rgba(0,0,0,0)") // no erase
        this.fadeRightGradient.addColorStop(1, "rgba(0,0,0,1)") // full erase at right edge
    }

    // ── Coordinate helpers ────────────────────────────────────────────────────

    /** Convert a MIDI note number to a Y coordinate (inner space, top=high, bottom=low). */
    private midiToY(midi: number): number {
        const range = this.midiMax - this.midiMin
        if (range === 0) return this.innerHeight / 2
        const frac = (midi - this.midiMin) / range
        return this.innerHeight - frac * this.innerHeight
    }

    /** Height in pixels for a single semitone lane. */
    private get semitoneHeight(): number {
        const range = this.midiMax - this.midiMin
        if (range === 0) return this.innerHeight
        const h = this.innerHeight / (range + 1)
        return Math.max(
            MIDI_VIEWER_CONFIG.minNoteHeight,
            Math.min(MIDI_VIEWER_CONFIG.maxNoteHeight, h),
        )
    }

    // ── Drawing ───────────────────────────────────────────────────────────────

    private drawRoundedRect(
        x: number,
        y: number,
        w: number,
        h: number,
        r: number,
    ): void {
        const ctx = this.ctx
        const clampedR = Math.min(r, w / 2, h / 2)
        ctx.beginPath()
        ctx.moveTo(x + clampedR, y)
        ctx.lineTo(x + w - clampedR, y)
        ctx.quadraticCurveTo(x + w, y, x + w, y + clampedR)
        ctx.lineTo(x + w, y + h - clampedR)
        ctx.quadraticCurveTo(x + w, y + h, x + w - clampedR, y + h)
        ctx.lineTo(x + clampedR, y + h)
        ctx.quadraticCurveTo(x, y + h, x, y + h - clampedR)
        ctx.lineTo(x, y + clampedR)
        ctx.quadraticCurveTo(x, y, x + clampedR, y)
        ctx.closePath()
    }

    private redraw(elapsed: number | null): void {
        const ctx = this.ctx
        const { margin, innerWidth, innerHeight, pxPerSec } = this
        const { nowFraction, noteRadius, minWidthForLabel } = MIDI_VIEWER_CONFIG

        ctx.clearRect(0, 0, this.width, this.height)

        ctx.save()
        ctx.translate(margin.left, margin.top)

        // ── Subtle pitch-lane guides ───────────────────────────────────────
        // Draw faint horizontal lines for each semitone in the range
        const noteH = this.semitoneHeight
        const range = this.midiMax - this.midiMin
        ctx.strokeStyle = "rgba(255,255,255,0.04)"
        ctx.lineWidth = 1
        for (let i = 0; i <= range; i++) {
            const midi = this.midiMin + i
            const y = this.midiToY(midi)
            ctx.beginPath()
            ctx.moveTo(0, y)
            ctx.lineTo(innerWidth, y)
            ctx.stroke()
        }

        const nowX = innerWidth * nowFraction

        // ── "Now" bar ─────────────────────────────────────────────────────
        const nowBarWidth = 2
        ctx.fillStyle = "rgba(255,255,255,0.18)"
        ctx.fillRect(nowX - nowBarWidth / 2, 0, nowBarWidth, innerHeight)

        // ── Notes ─────────────────────────────────────────────────────────
        if (elapsed !== null) {
            for (const note of this.notes) {
                // X position of note start relative to inner origin
                const xStart = nowX + (note.time - elapsed) * pxPerSec
                const noteWidth = note.duration * pxPerSec

                // Skip if entirely off canvas
                if (xStart + noteWidth < 0 || xStart > innerWidth) continue

                const yCenter = this.midiToY(note.midi)
                const yTop = yCenter - noteH / 2

                // Base color from string
                const colorStr = STRING_WAVEFORM_COLORS[note.string - 1]

                // Alpha: full at now bar, fades toward edges
                // Compute center X of the note relative to nowX
                const noteCenterX = xStart + noteWidth / 2
                const distFromNow = Math.abs(noteCenterX - nowX)
                const maxDist = Math.max(nowX, innerWidth - nowX)
                const alpha = Math.max(0, 1 - (distFromNow / maxDist) * 1.2)

                ctx.globalAlpha = alpha

                // Note body
                ctx.fillStyle = colorStr
                this.drawRoundedRect(xStart, yTop, noteWidth, noteH, noteRadius)
                ctx.fill()

                // Subtle bright top-edge highlight
                ctx.fillStyle = "rgba(255,255,255,0.25)"
                this.drawRoundedRect(
                    xStart,
                    yTop,
                    noteWidth,
                    noteH * 0.3,
                    noteRadius,
                )
                ctx.fill()

                // Note name label
                if (noteWidth >= minWidthForLabel) {
                    ctx.globalAlpha = alpha * 0.9
                    ctx.fillStyle = "rgba(255,255,255,0.95)"
                    ctx.font = `${Math.min(noteH * 0.7, 11)}px Inconsolata, monospace`
                    ctx.textBaseline = "middle"
                    ctx.textAlign = "center"
                    ctx.fillText(
                        note.name,
                        xStart + noteWidth / 2,
                        yCenter,
                        noteWidth - 4,
                    )
                }
            }
            ctx.globalAlpha = 1
        }

        ctx.restore()

        // ── Edge fades (applied in root space) ────────────────────────────
        this.applyFade()
    }

    private applyFade(): void {
        const ctx = this.ctx
        ctx.save()
        ctx.globalCompositeOperation = "destination-out"
        ctx.fillStyle = this.fadeLeftGradient
        ctx.fillRect(0, 0, this.width, this.height)
        ctx.fillStyle = this.fadeRightGradient
        ctx.fillRect(0, 0, this.width, this.height)
        ctx.restore()
    }

    // ── Public API ────────────────────────────────────────────────────────────

    /**
     * Load note data. Should be called with the same data passed to Guitar.load().
     */
    load(jsonData: JSONAudioFile, durationMultiplier = 1): void {
        this.notes = []
        let idx = 0
        for (const track of jsonData.tracks) {
            for (const note of track.notes) {
                this.notes.push({
                    key: `n${idx++}`,
                    time: note.time,
                    duration: note.duration * durationMultiplier,
                    string: note.string,
                    fret: note.fret,
                    velocity: note.velocity,
                    midi: note.midi,
                    name: note.name,
                })
            }
        }
        this.notes.sort((a, b) => a.time - b.time)

        // Compute pitch range with padding
        if (this.notes.length > 0) {
            const midiValues = this.notes.map((n) => n.midi)
            this.midiMin =
                Math.min(...midiValues) - MIDI_VIEWER_CONFIG.pitchPadding
            this.midiMax =
                Math.max(...midiValues) + MIDI_VIEWER_CONFIG.pitchPadding
        }

        // Rebuild fade gradients stays valid; draw empty state
        this.redraw(null)
    }

    /**
     * Set the playback start time (Tone.now() value when play() was called).
     */
    startVisualization(playStartTime: number): void {
        this.playStartTime = playStartTime
    }

    /**
     * Stop visualization and clear to empty state.
     */
    stopVisualization(): void {
        this.playStartTime = null
        this.redraw(null)
    }

    /**
     * Per-frame update. Called from the rAF loop with Tone.now().
     */
    updateVisuals(currentTime: number): void {
        if (this.playStartTime === null) return
        const elapsed = currentTime - this.playStartTime
        this.redraw(elapsed)
    }

    /**
     * Register callback invoked when the user clicks the sine-wave toggle icon.
     */
    addViewToggle(cb: () => void): void {
        this.onToggleCb = cb
    }

    /** Show this component. */
    show(): void {
        this.wrapper.style.display = "flex"
    }

    /** Hide this component. */
    hide(): void {
        this.wrapper.style.display = "none"
    }
}

