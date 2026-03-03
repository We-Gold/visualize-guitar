import { STRING_WAVEFORM_COLORS } from "../components/string-colors"
import type { JSONAudioFile } from "../audio/audio-modes"
import type { EditorState } from "./editor-state"

// ── Config ─────────────────────────────────────────────────────────────────────
const CANVAS_W = 520
const CANVAS_H = 160
const MARGIN = { top: 8, right: 8, bottom: 18, left: 30 }
const INNER_W = CANVAS_W - MARGIN.left - MARGIN.right
const INNER_H = CANVAS_H - MARGIN.top - MARGIN.bottom

/** MIDI pitch range displayed vertically (full guitar range). */
const MIDI_MIN = 38 // below E2 (40)
const MIDI_MAX = 84 // above A5 (81)
const SEMITONES = MIDI_MAX - MIDI_MIN

const PX_PER_SEMITONE = INNER_H / SEMITONES
const MIN_NOTE_H = Math.max(3, Math.floor(PX_PER_SEMITONE) - 1)

/** Minimum time window (seconds) shown on the roll even when empty. */
const MIN_TIME_WINDOW = 4

// Colors indexed by string number (1=high E ... 6=low E), STRING_WAVEFORM_COLORS is 0-indexed
function stringColor(stringNum: number): string {
    return STRING_WAVEFORM_COLORS[stringNum - 1] ?? "#888"
}

// ── Button style helpers ────────────────────────────────────────────────────────

function applyBaseBtn(el: HTMLButtonElement): void {
    Object.assign(el.style, {
        fontFamily: "Inconsolata, monospace",
        fontSize: "12px",
        padding: "3px 8px",
        border: "1px solid rgba(255,255,255,0.2)",
        borderRadius: "4px",
        background: "rgba(255,255,255,0.06)",
        color: "rgba(255,255,255,0.75)",
        cursor: "pointer",
        userSelect: "none",
        transition: "background 0.1s, color 0.1s",
        flexShrink: "0",
    })
    el.addEventListener("mouseenter", () => {
        el.style.background = "rgba(255,255,255,0.14)"
        el.style.color = "#fff"
    })
    el.addEventListener("mouseleave", () => {
        // active state will re-apply
        el.dispatchEvent(new Event("_restoreStyle"))
    })
    // Return focus to the document after a click so arrow-key shortcuts
    // are not captured by the button element.
    el.addEventListener("mouseup", () => el.blur())
}

function activeBtnStyle(el: HTMLButtonElement, active: boolean): void {
    el.style.background = active
        ? "rgba(254,134,1,0.35)"
        : "rgba(255,255,255,0.06)"
    el.style.color = active ? "#FE8601" : "rgba(255,255,255,0.75)"
    el.style.borderColor = active ? "#FE8601" : "rgba(255,255,255,0.2)"
}

function makeLabel(text: string): HTMLSpanElement {
    const s = document.createElement("span")
    s.textContent = text
    Object.assign(s.style, {
        color: "rgba(255,255,255,0.4)",
        fontFamily: "Inconsolata, monospace",
        fontSize: "11px",
        userSelect: "none",
    })
    return s
}

function makeRow(gap = "6px"): HTMLDivElement {
    const d = document.createElement("div")
    Object.assign(d.style, {
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
        gap,
        flexWrap: "wrap",
    })
    return d
}

// ── EditorPanel ─────────────────────────────────────────────────────────────────

export class EditorPanel {
    private wrapper: HTMLElement
    private canvas: HTMLCanvasElement
    private ctx: CanvasRenderingContext2D
    private dpr: number
    private state: EditorState

    private playBtn!: HTMLButtonElement
    private isPlaying = false

    private playCb: (() => void) | null = null
    private stopCb: (() => void) | null = null
    private saveCb: ((data: JSONAudioFile) => void) | null = null
    private mainViewCb: ((data: JSONAudioFile) => void) | null = null
    private clearCb: (() => void) | null = null

    // For hit-testing note clicks on canvas
    private renderedNoteRects: Array<{
        x: number
        y: number
        w: number
        h: number
        index: number
    }> = []

    constructor(appContainer: HTMLElement, state: EditorState) {
        this.state = state

        // ── Outer wrapper ──────────────────────────────────────────────────────
        this.wrapper = document.createElement("div")
        this.wrapper.id = "editor-panel"
        Object.assign(this.wrapper.style, {
            position: "absolute",
            bottom: "20px",
            right: "20px",
            zIndex: "10",
            display: "none",
            flexDirection: "column",
            alignItems: "stretch",
            gap: "6px",
            background: "rgba(0,0,0,0.55)",
            border: "1px solid rgba(255,255,255,0.10)",
            borderRadius: "8px",
            padding: "10px 12px",
            backdropFilter: "blur(6px)",
        })
        appContainer.appendChild(this.wrapper)

        this.buildControls()

        // ── Piano roll canvas ────────────────────────────────────────────────
        this.dpr = window.devicePixelRatio || 1
        this.canvas = document.createElement("canvas")
        this.canvas.width = Math.round(CANVAS_W * this.dpr)
        this.canvas.height = Math.round(CANVAS_H * this.dpr)
        this.canvas.style.width = `${CANVAS_W}px`
        this.canvas.style.height = `${CANVAS_H}px`
        this.canvas.style.display = "block"
        this.canvas.style.borderRadius = "4px"
        this.canvas.style.cursor = "pointer"
        this.wrapper.appendChild(this.canvas)

        this.ctx = this.canvas.getContext("2d")!
        this.ctx.scale(this.dpr, this.dpr)

        // Click on canvas → delete the clicked note
        this.canvas.addEventListener("click", (e) => this.onCanvasClick(e))

        // Re-render whenever state changes
        state.onChange(() => this.render())
        this.render()
    }

    // ── Control rows ─────────────────────────────────────────────────────────

    private buildControls(): void {
        const { state } = this

        // Row 1: Duration buttons + BPM
        const row1 = makeRow("5px")
        row1.style.marginBottom = "2px"
        this.wrapper.appendChild(row1)

        row1.appendChild(makeLabel("DUR"))
        const durLabels = ["1/16", "1/8", "1/4", "1/2", "1"] as const
        const durBtns: HTMLButtonElement[] = []

        for (const label of durLabels) {
            const btn = document.createElement("button")
            btn.textContent = label
            applyBaseBtn(btn)
            activeBtnStyle(btn, label === state.durationLabel)
            btn.addEventListener("_restoreStyle" as any, () =>
                activeBtnStyle(btn, state.durationLabel === label),
            )
            btn.addEventListener("click", () => {
                state.setDuration(label)
                durBtns.forEach((b, i) =>
                    activeBtnStyle(b, durLabels[i] === state.durationLabel),
                )
            })
            durBtns.push(btn)
            row1.appendChild(btn)
        }

        // Subscribe to re-sync active button when state changes
        state.onChange(() => {
            durBtns.forEach((b, i) =>
                activeBtnStyle(b, durLabels[i] === state.durationLabel),
            )
        })

        // Spacer
        const sp1 = document.createElement("span")
        sp1.style.flex = "1"
        row1.appendChild(sp1)

        // BPM input
        row1.appendChild(makeLabel("BPM"))
        const bpmInput = document.createElement("input")
        bpmInput.type = "number"
        bpmInput.min = "20"
        bpmInput.max = "300"
        bpmInput.value = String(state.tempo)
        Object.assign(bpmInput.style, {
            width: "52px",
            fontFamily: "Inconsolata, monospace",
            fontSize: "12px",
            background: "rgba(255,255,255,0.08)",
            border: "1px solid rgba(255,255,255,0.18)",
            borderRadius: "4px",
            color: "#fff",
            padding: "2px 5px",
            textAlign: "right",
        })
        bpmInput.addEventListener("change", () => {
            const val = parseInt(bpmInput.value, 10)
            if (!isNaN(val)) state.setTempo(val)
        })
        state.onChange(() => {
            bpmInput.value = String(state.tempo)
        })
        row1.appendChild(bpmInput)

        // Row 2: Navigation + Delete
        const row2 = makeRow("5px")
        this.wrapper.appendChild(row2)

        const navDefs: Array<[string, () => void, string]> = [
            ["|◀", () => state.goToStart(), "Go to start"],
            ["◀", () => state.retreatCursor(), "Retreat one step"],
            ["▶", () => state.advanceCursor(), "Advance one step"],
            ["▶|", () => state.goToEnd(), "Go to end"],
        ]

        for (const [label, action, title] of navDefs) {
            const btn = document.createElement("button")
            btn.textContent = label
            btn.title = title
            applyBaseBtn(btn)
            btn.addEventListener("click", action)
            row2.appendChild(btn)
        }

        const sp2 = document.createElement("span")
        sp2.style.flex = "1"
        row2.appendChild(sp2)

        const deleteBtn = document.createElement("button")
        deleteBtn.textContent = "⌫ DELETE"
        deleteBtn.title = "Delete notes at cursor"
        applyBaseBtn(deleteBtn)
        deleteBtn.style.borderColor = "rgba(255,80,80,0.45)"
        deleteBtn.style.color = "rgba(255,130,130,0.85)"
        deleteBtn.addEventListener("click", () => state.deleteNotesAtCursor())
        row2.appendChild(deleteBtn)

        const clearBtn = document.createElement("button")
        clearBtn.textContent = "✕ CLEAR"
        clearBtn.title = "Clear the entire composition"
        applyBaseBtn(clearBtn)
        clearBtn.style.borderColor = "rgba(255,80,80,0.45)"
        clearBtn.style.color = "rgba(255,130,130,0.85)"
        clearBtn.addEventListener("click", () => {
            state.reset()
            this.clearCb?.()
        })
        row2.appendChild(clearBtn)

        // Row 3: Undo/Redo + Play + Save
        const row3 = makeRow("5px")
        this.wrapper.appendChild(row3)

        const undoBtn = document.createElement("button")
        undoBtn.textContent = "↩ UNDO"
        applyBaseBtn(undoBtn)
        undoBtn.addEventListener("click", () => state.undo())
        undoBtn.title = "Undo (Ctrl+Z)"
        row3.appendChild(undoBtn)

        const redoBtn = document.createElement("button")
        redoBtn.textContent = "↪ REDO"
        applyBaseBtn(redoBtn)
        redoBtn.addEventListener("click", () => state.redo())
        redoBtn.title = "Redo (Ctrl+Shift+Z)"
        row3.appendChild(redoBtn)

        const sp3 = document.createElement("span")
        sp3.style.flex = "1"
        row3.appendChild(sp3)

        this.playBtn = document.createElement("button")
        this.playBtn.textContent = "▶ PLAY"
        applyBaseBtn(this.playBtn)
        this.playBtn.style.borderColor = "rgba(100,220,100,0.45)"
        this.playBtn.style.color = "rgba(120,230,120,0.85)"
        this.playBtn.addEventListener("click", () => this.handlePlayStop())
        row3.appendChild(this.playBtn)

        const saveBtn = document.createElement("button")
        saveBtn.textContent = "⬇ SAVE"
        applyBaseBtn(saveBtn)
        saveBtn.title = "Download as composition.json"
        saveBtn.addEventListener("click", () => this.handleSave())
        row3.appendChild(saveBtn)

        const mainViewBtn = document.createElement("button")
        mainViewBtn.textContent = "↗ MAIN VIEW"
        applyBaseBtn(mainViewBtn)
        mainViewBtn.title = "Switch to main view and play this composition"
        mainViewBtn.style.borderColor = "rgba(254,200,1,0.55)"
        mainViewBtn.style.color = "rgba(254,220,80,0.9)"
        mainViewBtn.addEventListener("click", () =>
            this.mainViewCb?.(this.state.serialize()),
        )
        row3.appendChild(mainViewBtn)

        // Hidden file input for loading a JSON composition
        const fileInput = document.createElement("input")
        fileInput.type = "file"
        fileInput.accept = ".json,application/json"
        fileInput.style.display = "none"
        fileInput.addEventListener("change", () => this.handleLoad(fileInput))
        this.wrapper.appendChild(fileInput)

        const loadBtn = document.createElement("button")
        loadBtn.textContent = "📁 LOAD"
        applyBaseBtn(loadBtn)
        loadBtn.title = "Load a composition.json file"
        loadBtn.addEventListener("click", () => fileInput.click())
        row3.appendChild(loadBtn)

        // Keyboard shortcuts
        document.addEventListener("keydown", (e) => {
            if (!this.isShown()) return
            if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === "z") {
                e.preventDefault()
                state.redo()
            } else if ((e.ctrlKey || e.metaKey) && e.key === "z") {
                e.preventDefault()
                state.undo()
            } else if (e.key === "ArrowRight") {
                e.preventDefault()
                state.advanceCursor()
            } else if (e.key === "ArrowLeft") {
                e.preventDefault()
                state.retreatCursor()
            } else if (e.key === "Delete" || e.key === "Backspace") {
                e.preventDefault()
                state.deleteNotesAtCursor()
            }
        })
    }

    // ── Playback callbacks ────────────────────────────────────────────────────

    onPlay(cb: () => void): void {
        this.playCb = cb
    }
    onStop(cb: () => void): void {
        this.stopCb = cb
    }
    onSave(cb: (data: JSONAudioFile) => void): void {
        this.saveCb = cb
    }
    onMainView(cb: (data: JSONAudioFile) => void): void {
        this.mainViewCb = cb
    }
    onClear(cb: () => void): void {
        this.clearCb = cb
    }

    private handlePlayStop(): void {
        if (this.isPlaying) {
            this.isPlaying = false
            this.playBtn.textContent = "▶ PLAY"
            this.playBtn.style.color = "rgba(120,230,120,0.85)"
            this.stopCb?.()
        } else {
            if (this.state.isEmpty()) return
            this.isPlaying = true
            this.playBtn.textContent = "⏹ STOP"
            this.playBtn.style.color = "rgba(255,130,130,0.85)"
            this.playCb?.()
        }
    }

    /** Called by main.ts when playback finishes naturally. */
    notifyPlaybackEnded(): void {
        this.isPlaying = false
        this.playBtn.textContent = "▶ PLAY"
        this.playBtn.style.color = "rgba(120,230,120,0.85)"
    }

    // ── Save ─────────────────────────────────────────────────────────────────

    private handleSave(): void {
        const data = this.state.serialize()
        const json = JSON.stringify(data, null, 2)
        // Notify main.ts so the selector mode can be updated
        this.saveCb?.(data)
        // Trigger browser download
        const blob = new Blob([json], { type: "application/json" })
        const url = URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = url
        a.download = "composition.json"
        a.click()
        URL.revokeObjectURL(url)
    }

    private handleLoad(fileInput: HTMLInputElement): void {
        const file = fileInput.files?.[0]
        if (!file) return
        const reader = new FileReader()
        reader.onload = (e) => {
            try {
                const parsed: JSONAudioFile = JSON.parse(
                    e.target!.result as string,
                )
                this.state.loadData(parsed)
                this.saveCb?.(this.state.serialize())
            } catch {
                console.warn("Failed to parse loaded JSON composition")
            }
        }
        reader.readAsText(file)
        // Reset so the same file can be re-loaded
        fileInput.value = ""
    }

    // ── Piano roll rendering ──────────────────────────────────────────────────

    render(): void {
        const { ctx } = this
        ctx.clearRect(0, 0, CANVAS_W, CANVAS_H)

        // Background
        ctx.fillStyle = "rgba(0,0,0,0.50)"
        ctx.beginPath()
        ;(ctx as any).roundRect(0, 0, CANVAS_W, CANVAS_H, 4)
        ctx.fill()

        const notes = this.state.notes
        const cursor = this.state.timeCursor
        const endTime = Math.max(
            MIN_TIME_WINDOW,
            notes.length > 0
                ? Math.max(...notes.map((n) => n.time + n.duration)) + 0.5
                : 0,
            cursor + this.state.noteDurationSeconds * 2,
        )

        const pxPerSec = INNER_W / endTime

        // ── Pitch lane guides ─────────────────────────────────────────────────
        for (let midi = MIDI_MIN; midi <= MIDI_MAX; midi++) {
            const y =
                MARGIN.top + INNER_H - ((midi - MIDI_MIN) / SEMITONES) * INNER_H
            const isNatural = [0, 2, 4, 5, 7, 9, 11].includes(midi % 12)
            ctx.fillStyle = isNatural
                ? "rgba(255,255,255,0.03)"
                : "rgba(0,0,0,0.15)"
            ctx.fillRect(
                MARGIN.left,
                y - PX_PER_SEMITONE,
                INNER_W,
                PX_PER_SEMITONE,
            )
        }

        // ── Pitch axis labels ─────────────────────────────────────────────────
        const labelMidis = [40, 45, 50, 55, 59, 64, 69, 76]
        const noteNamesFull = [
            "C",
            "C#",
            "D",
            "D#",
            "E",
            "F",
            "F#",
            "G",
            "G#",
            "A",
            "A#",
            "B",
        ]
        ctx.fillStyle = "rgba(255,255,255,0.3)"
        ctx.font = `9px Inconsolata, monospace`
        ctx.textAlign = "right"
        ctx.textBaseline = "middle"
        for (const midi of labelMidis) {
            const y =
                MARGIN.top + INNER_H - ((midi - MIDI_MIN) / SEMITONES) * INNER_H
            const name =
                noteNamesFull[midi % 12] + String(Math.floor(midi / 12) - 1)
            ctx.fillText(name, MARGIN.left - 3, y)
        }

        // ── Time axis ticks ───────────────────────────────────────────────────
        ctx.strokeStyle = "rgba(255,255,255,0.08)"
        ctx.lineWidth = 1
        const beatSec = 60 / this.state.tempo
        for (let t = 0; t <= endTime; t += beatSec) {
            const x = MARGIN.left + t * pxPerSec
            ctx.beginPath()
            ctx.moveTo(x, MARGIN.top)
            ctx.lineTo(x, MARGIN.top + INNER_H)
            ctx.stroke()
        }

        // ── Notes ─────────────────────────────────────────────────────────────
        this.renderedNoteRects = []

        for (let i = 0; i < notes.length; i++) {
            const n = notes[i]
            const x = MARGIN.left + n.time * pxPerSec
            const w = Math.max(3, n.duration * pxPerSec - 1)
            const noteY =
                MARGIN.top +
                INNER_H -
                ((n.midi - MIDI_MIN + 0.5) / SEMITONES) * INNER_H
            const h = Math.max(MIN_NOTE_H, PX_PER_SEMITONE - 1)
            const y = noteY - h / 2

            const color = stringColor(n.string)
            ctx.fillStyle = color
            ctx.globalAlpha = 0.85
            ctx.beginPath()
            ;(ctx as any).roundRect(x, y, w, h, 2)
            ctx.fill()
            ctx.globalAlpha = 1

            // Note label if wide enough
            if (w > 22) {
                ctx.fillStyle = "rgba(255,255,255,0.75)"
                ctx.font = `8px Inconsolata, monospace`
                ctx.textAlign = "left"
                ctx.textBaseline = "middle"
                ctx.fillText(n.name, x + 3, y + h / 2)
            }

            this.renderedNoteRects.push({ x, y, w, h, index: i })
        }

        // ── Cursor line ───────────────────────────────────────────────────────
        const cx = MARGIN.left + cursor * pxPerSec
        ctx.save()
        ctx.shadowColor = "rgba(255,180,60,0.9)"
        ctx.shadowBlur = 6
        ctx.strokeStyle = "rgba(255,180,60,0.9)"
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.moveTo(cx, MARGIN.top - 2)
        ctx.lineTo(cx, MARGIN.top + INNER_H + 2)
        ctx.stroke()
        ctx.restore()

        // ── Border ────────────────────────────────────────────────────────────
        ctx.strokeStyle = "rgba(255,255,255,0.08)"
        ctx.lineWidth = 1
        ctx.strokeRect(MARGIN.left, MARGIN.top, INNER_W, INNER_H)

        // ── "Empty" hint ──────────────────────────────────────────────────────
        if (notes.length === 0) {
            ctx.fillStyle = "rgba(255,255,255,0.18)"
            ctx.font = `11px Inconsolata, monospace`
            ctx.textAlign = "center"
            ctx.textBaseline = "middle"
            ctx.fillText(
                "Click the fretboard to add notes",
                MARGIN.left + INNER_W / 2,
                MARGIN.top + INNER_H / 2,
            )
        }
    }

    // ── Canvas click → delete note ────────────────────────────────────────────

    private onCanvasClick(e: MouseEvent): void {
        const rect = this.canvas.getBoundingClientRect()
        const mx = e.clientX - rect.left
        const my = e.clientY - rect.top

        // Search in reverse order so topmost (latest added) note is checked first
        for (let i = this.renderedNoteRects.length - 1; i >= 0; i--) {
            const r = this.renderedNoteRects[i]
            if (mx >= r.x && mx <= r.x + r.w && my >= r.y && my <= r.y + r.h) {
                this.state.deleteNoteAtIndex(r.index)
                return
            }
        }
    }

    // ── Visibility ────────────────────────────────────────────────────────────

    show(): void {
        this.wrapper.style.display = "flex"
        this.render()
    }

    hide(): void {
        this.wrapper.style.display = "none"
        if (this.isPlaying) {
            this.isPlaying = false
            this.playBtn.textContent = "▶ PLAY"
            this.playBtn.style.color = "rgba(120,230,120,0.85)"
            this.stopCb?.()
        }
    }

    isShown(): boolean {
        return this.wrapper.style.display !== "none"
    }
}

