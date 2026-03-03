import type { JSONAudioFile } from "../audio/audio-modes"

// ── MIDI utilities ─────────────────────────────────────────────────────────────

const NOTE_NAMES = [
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

function midiToName(midi: number): string {
    const octave = Math.floor(midi / 12) - 1
    const name = NOTE_NAMES[midi % 12]
    return `${name}${octave}`
}

/** Open-string MIDI pitch for each string (standard tuning). */
export const OPEN_STRING_MIDI: Record<number, number> = {
    1: 64, // E4
    2: 59, // B3
    3: 55, // G3
    4: 50, // D3
    5: 45, // A2
    6: 40, // E2
}

/** Compute MIDI pitch and note name for a given string + fret position. */
export function computeNoteMidi(
    stringNum: number,
    fret: number,
): { midi: number; name: string } {
    const midi = OPEN_STRING_MIDI[stringNum] + fret
    return { midi, name: midiToName(midi) }
}

// ── Duration definitions ───────────────────────────────────────────────────────

export type DurationLabel = "1/16" | "1/8" | "1/4" | "1/2" | "1"

/** Duration in quarter-note beats (1.0 = one quarter note). */
export const DURATION_BEATS: Record<DurationLabel, number> = {
    "1/16": 0.25,
    "1/8": 0.5,
    "1/4": 1.0,
    "1/2": 2.0,
    "1": 4.0,
}

// ── EditorState ────────────────────────────────────────────────────────────────

export class EditorState {
    private data: JSONAudioFile
    private _timeCursor = 0
    private _durationLabel: DurationLabel = "1/4"
    private _tempo = 120
    private _undoStack: string[] = [] // JSON snapshots
    private _redoStack: string[] = []
    private _changeCallbacks: Array<() => void> = []

    constructor() {
        this.data = this.emptyFile()
    }

    // ── Internal helpers ──────────────────────────────────────────────────────

    private emptyFile(): JSONAudioFile {
        return {
            meta: {
                title: "My Composition",
                tempo: this._tempo,
                timeSignature: [4, 4],
                tuning: [64, 59, 55, 50, 45, 40],
            },
            tracks: [{ name: "Guitar", notes: [] }],
        }
    }

    private saveUndo(): void {
        this._undoStack.push(JSON.stringify(this.data))
        if (this._undoStack.length > 100) this._undoStack.shift()
        this._redoStack = []
    }

    private notify(): void {
        for (const cb of this._changeCallbacks) cb()
    }

    // ── Subscription ──────────────────────────────────────────────────────────

    /** Register a callback that fires whenever the editor state changes. */
    onChange(cb: () => void): void {
        this._changeCallbacks.push(cb)
    }

    // ── Getters ───────────────────────────────────────────────────────────────

    get timeCursor(): number {
        return this._timeCursor
    }
    get durationLabel(): DurationLabel {
        return this._durationLabel
    }
    get tempo(): number {
        return this._tempo
    }

    /** Duration of one note in seconds at the current tempo. */
    get noteDurationSeconds(): number {
        return DURATION_BEATS[this._durationLabel] * (60 / this._tempo)
    }

    /** All notes in the composition (mutable reference, treat as read-only outside this class). */
    get notes(): JSONAudioFile["tracks"][0]["notes"] {
        return this.data.tracks[0].notes
    }

    hasUndo(): boolean {
        return this._undoStack.length > 0
    }
    hasRedo(): boolean {
        return this._redoStack.length > 0
    }
    isEmpty(): boolean {
        return this.data.tracks[0].notes.length === 0
    }

    // ── Mutations ─────────────────────────────────────────────────────────────

    setDuration(label: DurationLabel): void {
        this._durationLabel = label
        this.notify()
    }

    setTempo(bpm: number): void {
        this._tempo = Math.max(20, Math.min(300, bpm))
        if (this.data.meta) this.data.meta.tempo = this._tempo
        this.notify()
    }

    addNote(stringNum: number, fret: number): void {
        this.saveUndo()
        // Remove any existing note on this string at the current cursor position
        const eps = this.noteDurationSeconds / 2
        this.data.tracks[0].notes = this.data.tracks[0].notes.filter(
            (n) =>
                !(
                    n.string === stringNum &&
                    Math.abs(n.time - this._timeCursor) <= eps
                ),
        )
        const { midi, name } = computeNoteMidi(stringNum, fret)
        this.data.tracks[0].notes.push({
            time: this._timeCursor,
            duration: this.noteDurationSeconds,
            midi,
            name,
            velocity: 0.8,
            string: stringNum,
            fret,
        })
        this.notify()
    }

    deleteNotesAtCursor(): void {
        const eps = this.noteDurationSeconds / 2
        const before = this.data.tracks[0].notes.length
        this.data.tracks[0].notes = this.data.tracks[0].notes.filter(
            (n) => Math.abs(n.time - this._timeCursor) > eps,
        )
        if (this.data.tracks[0].notes.length !== before) {
            this.saveUndo()
            this.notify()
        }
    }

    deleteNoteAtIndex(index: number): void {
        if (index < 0 || index >= this.data.tracks[0].notes.length) return
        this.saveUndo()
        this.data.tracks[0].notes.splice(index, 1)
        this.notify()
    }

    advanceCursor(): void {
        this._timeCursor =
            Math.round((this._timeCursor + this.noteDurationSeconds) * 1e6) /
            1e6
        this.notify()
    }

    retreatCursor(): void {
        this._timeCursor = Math.max(
            0,
            Math.round((this._timeCursor - this.noteDurationSeconds) * 1e6) /
                1e6,
        )
        this.notify()
    }

    goToStart(): void {
        this._timeCursor = 0
        this.notify()
    }

    goToEnd(): void {
        const notes = this.data.tracks[0].notes
        if (notes.length === 0) {
            this._timeCursor = 0
            return
        }
        this._timeCursor = Math.max(...notes.map((n) => n.time + n.duration))
        this.notify()
    }

    undo(): void {
        if (this._undoStack.length === 0) return
        this._redoStack.push(JSON.stringify(this.data))
        this.data = JSON.parse(this._undoStack.pop()!)
        this._tempo = this.data.meta?.tempo ?? this._tempo
        this.notify()
    }

    redo(): void {
        if (this._redoStack.length === 0) return
        this._undoStack.push(JSON.stringify(this.data))
        this.data = JSON.parse(this._redoStack.pop()!)
        this._tempo = this.data.meta?.tempo ?? this._tempo
        this.notify()
    }

    reset(): void {
        this.saveUndo()
        this.data = this.emptyFile()
        this._timeCursor = 0
        this.notify()
    }

    // ── Serialization ─────────────────────────────────────────────────────────

    /**
     * Replace the current composition with the supplied data.
     * Resets cursor, clears undo/redo, and fires change callbacks.
     */
    loadData(jsonData: JSONAudioFile): void {
        this._undoStack = []
        this._redoStack = []
        this.data = {
            meta: jsonData.meta ?? this.emptyFile().meta,
            tracks: [
                {
                    name: "Guitar",
                    notes: [...(jsonData.tracks[0]?.notes ?? [])],
                },
            ],
        }
        this._tempo = this.data.meta?.tempo ?? 120
        this._timeCursor = 0
        this.notify()
    }

    /** Return a clean, sorted copy of the composition data. */
    serialize(): JSONAudioFile {
        const notes = [...this.data.tracks[0].notes].sort(
            (a, b) => a.time - b.time,
        )
        return {
            meta: { ...this.data.meta! },
            tracks: [{ name: "Guitar", notes }],
        }
    }

    /** Return the notes at the current cursor position (within a half-duration window). */
    getNotesAtCursor(): JSONAudioFile["tracks"][0]["notes"] {
        const eps = this.noteDurationSeconds / 2
        return this.data.tracks[0].notes.filter(
            (n) => Math.abs(n.time - this._timeCursor) <= eps,
        )
    }
}

