import "./style.css"
import * as Tone from "tone"
import { Guitar } from "./components/guitar"
import { Selector } from "./components/selector"
import { FrequencyPlotter } from "./components/frequency-plotter"
import { WaveformPlotter } from "./components/waveform-plotter"
import { AudioController } from "./audio/audio-controller"
import { audioModes } from "./audio/audio-modes"
import type {
    AudioMode,
    JSONAudioFile,
    JSONAudioMode,
} from "./audio/audio-modes"
import { MidiViewer } from "./components/midi-viewer"
import { EditorState, computeNoteMidi } from "./editor/editor-state"
import { EditorPanel } from "./editor/editor-panel"
import { EditModeToggle } from "./editor/edit-mode-toggle"
import { GuitarEditOverlay } from "./editor/guitar-edit-overlay"

// ── Responsive scaling ───────────────────────────────────────────────────────
/** Viewport height at which the overlay panels are designed (MacBook Air dev baseline). */
const REFERENCE_HEIGHT = 862

function applyResponsiveScale(): void {
    const scale = Math.min(1, window.innerHeight / REFERENCE_HEIGHT)
    const panels: Array<{ id: string; origin: string }> = [
        { id: "frequency-plot", origin: "top right" },
        { id: "waveform-plot", origin: "bottom right" },
        { id: "midi-viewer", origin: "bottom right" },
        { id: "editor-panel", origin: "bottom right" },
    ]
    for (const { id, origin } of panels) {
        const el = document.getElementById(id)
        if (!el) continue
        el.style.transformOrigin = origin
        el.style.transform = `scale(${scale})`
    }
}

;(async () => {
    const audioController = new AudioController()
    await audioController.init()

    // Create frequency plotter
    const plotter = new FrequencyPlotter("#frequency-plot")

    // Create waveform plotter
    const waveformPlotter = new WaveformPlotter("#waveform-plot")

    // Create MIDI viewer (hidden by default; shares the same screen slot)
    const midiViewer = new MidiViewer(document.getElementById("app")!)

    // ── Editor state + panel (hidden by default) ─────────────────────────────
    const editorState = new EditorState()
    const editorPanel = new EditorPanel(
        document.getElementById("app")!,
        editorState,
    )

    // Auto-sync editor state to localStorage on every change (debounced)
    const STORAGE_KEY = "visualize-guitar-composition"
    let syncTimeoutId: number | undefined
    editorState.onChange(() => {
        clearTimeout(syncTimeoutId)
        syncTimeoutId = window.setTimeout(() => {
            if (!editorState.isEmpty()) {
                try {
                    localStorage.setItem(
                        STORAGE_KEY,
                        JSON.stringify(editorState.serialize()),
                    )
                } catch {
                    // non-fatal
                }
            }
        }, 300)
    })

    // Apply initial scale and keep in sync on resize
    applyResponsiveScale()
    window.addEventListener("resize", applyResponsiveScale)

    // Toggle between waveform and MIDI views
    let showingMidi = false
    let isInEditMode = false
    let editorPlaybackActive = false
    const toggleView = () => {
        showingMidi = !showingMidi
        if (showingMidi) {
            waveformPlotter.hide()
            midiViewer.show()
        } else {
            midiViewer.hide()
            waveformPlotter.show()
        }
    }
    waveformPlotter.addViewToggle(toggleView)
    midiViewer.addViewToggle(toggleView)

    let unsubscribeListener: (() => void) | null = null
    let animationLoopStarted = false

    const startAnimationLoop = () => {
        if (animationLoopStarted) return
        animationLoopStarted = true
        const animate = () => {
            audioController.updateAnalyzerState()
            guitar.updateVisuals(Tone.now())
            midiViewer.updateVisuals(Tone.now())

            // Drive playhead in editor mode
            if (isInEditMode && editorPlaybackActive) {
                editorPanel.updatePlayhead(Tone.now())
            }

            // Poll for natural end of editor playback preview
            if (
                isInEditMode &&
                editorPlaybackActive &&
                !audioController.jsonPlayer?.isCurrentlyPlaying()
            ) {
                editorPlaybackActive = false
                guitar.stopVisualization()
                editorPanel.notifyPlaybackEnded()
                updateStaticFingers()
            }

            requestAnimationFrame(animate)
        }
        animate()
    }

    let currentPlayId = 0

    const playAudioMode = async (index: number) => {
        const playId = ++currentPlayId

        // Exit edit mode if the user switches songs while editing
        if (isInEditMode) {
            isInEditMode = false
            editToggle.setEditMode(false)
            editorPanel.hide()
            if (editOverlay) editOverlay.hide()
            guitar.clearStaticFingers()
            const freqEl = document.getElementById("frequency-plot")
            if (freqEl) freqEl.style.display = "flex"
            if (!showingMidi) waveformPlotter.show()
        }

        // Fade out and stop current audio, then clear visuals
        await audioController.fadeOutAndStop()
        guitar.stopVisualization()
        midiViewer.stopVisualization()

        // Brief silence gap before starting the next mode
        await new Promise<void>((resolve) => setTimeout(resolve, 500))
        if (playId !== currentPlayId) return

        const audioMode = modes[index]

        if (audioMode.type === "midi") {
            await audioController.midiPlayer.load(
                audioMode.midiPath,
                audioMode.playConfig,
            )
            if (playId !== currentPlayId) return
            audioController.midiPlayer.play()
        } else if (audioMode.type === "json") {
            // Load audio data — either from an in-memory composition or by fetching
            let jsonData: JSONAudioFile
            if (audioMode.jsonData) {
                jsonData = audioMode.jsonData
            } else {
                const response = await fetch(audioMode.jsonPath!)
                if (playId !== currentPlayId) return
                jsonData = await response.json()
            }
            await guitar.load(
                jsonData,
                audioMode.playConfig?.durationMultiplier,
            )
            midiViewer.load(jsonData, audioMode.playConfig?.durationMultiplier)
            if (playId !== currentPlayId) return

            if (audioMode.jsonData) {
                audioController.jsonPlayer.loadData(
                    audioMode.jsonData,
                    audioMode.playConfig,
                    audioMode.loop,
                )
            } else {
                await audioController.jsonPlayer.load(
                    audioMode.jsonPath!,
                    audioMode.playConfig,
                    audioMode.loop,
                )
            }
            if (playId !== currentPlayId) return
            // Re-sync both visualizers on every loop iteration
            audioController.jsonPlayer.onPlay((t) => {
                guitar.startVisualization(t)
                midiViewer.startVisualization(t)
            })
            audioController.jsonPlayer.play()
        }
    }

    const onStart = async () => {
        // Trigger on user interaction to comply with browser autoplay policies
        await audioController.resumeAudioContext()

        // Register listener for plotter updates (once)
        if (unsubscribeListener) unsubscribeListener()
        unsubscribeListener = audioController.onAnalyzerUpdate((state) => {
            plotter.updateBars(state)
            waveformPlotter.updateWaveform(state)
            waveformPlotter.updateStringWaveforms(state.stringWaveformValues)
        })

        // Start animation loop for real-time updates
        startAnimationLoop()

        await playAudioMode(0)
    }

    const onModeChange = async (index: number) => {
        await playAudioMode(index)
    }

    // Create and mount the selector at the top of the app
    // Use a mutable list so the editor composition can be appended at runtime
    const modes: AudioMode[] = [...audioModes]

    // Restore a previously saved composition from localStorage
    const savedJson = localStorage.getItem(STORAGE_KEY)
    if (savedJson) {
        try {
            const savedData = JSON.parse(savedJson)
            // Pre-populate the editor so the saved piece is ready to edit
            editorState.loadData(savedData)
            modes.push({
                type: "json",
                name: "MY COMPOSITION",
                description: "Your saved composition",
                jsonData: savedData,
                loop: true,
            })
        } catch {
            // Corrupted storage — ignore
        }
    }

    const selectorContainer = document.createElement("div")
    selectorContainer.id = "selector-container"
    document.getElementById("app")!.appendChild(selectorContainer)
    const selector = new Selector(selectorContainer)
    selector.addSelector(modes, onStart, onModeChange)

    const guitar = new Guitar(document.getElementById("app")!)
    guitar.addGuitar()

    // ── Edit mode toggle (pencil icon, left of selector) ─────────────────────
    const editToggle = new EditModeToggle(selectorContainer)

    // ── Guitar SVG ready: set up the fretboard overlay ───────────────────────
    let editOverlay: GuitarEditOverlay | null = null

    guitar.onSvgReady((svgEl) => {
        editOverlay = new GuitarEditOverlay(svgEl)

        editOverlay.onFretClick((stringNum, fret) => {
            editorState.addNote(stringNum, fret)
            // Play a preview of the note immediately
            if (audioController.guitarSampler) {
                const { name } = computeNoteMidi(stringNum, fret)
                audioController.guitarSampler.playOnString(
                    stringNum,
                    name,
                    editorState.noteDurationSeconds,
                )
            }
        })

        editOverlay.onStrumClick(() => {
            const notesAtCursor = editorState.getNotesAtCursor()
            if (audioController.guitarSampler) {
                if (notesAtCursor.length > 0) {
                    for (const n of notesAtCursor) {
                        audioController.guitarSampler.playOnString(
                            n.string,
                            n.name,
                            n.duration,
                        )
                    }
                } else {
                    // No notes at cursor → play all open strings as a preview
                    for (let s = 1; s <= 6; s++) {
                        const { name } = computeNoteMidi(s, 0)
                        audioController.guitarSampler.playOnString(s, name, 0.5)
                    }
                }
            }
        })
    })

    // ── Helper: show static finger circles for notes at cursor ────────────────
    const updateStaticFingers = () => {
        if (!isInEditMode) return
        const notes = editorState.getNotesAtCursor()
        guitar.showStaticFingers(
            notes.map((n) => ({ string: n.string, fret: n.fret })),
        )
    }

    editorState.onChange(updateStaticFingers)

    // ── Enter / exit edit mode ────────────────────────────────────────────────
    const enterEditMode = async () => {
        isInEditMode = true
        // Ensure audio is initialised (requires user-gesture, which clicking the toggle provides)
        await audioController.resumeAudioContext()
        // Start the animation loop if it hasn't been started yet (e.g. user enters edit mode
        // before clicking CLICK TO START)
        startAnimationLoop()
        await audioController.fadeOutAndStop()
        guitar.stopVisualization()
        midiViewer.stopVisualization()

        // Hide normal panels
        const freqEl = document.getElementById("frequency-plot")
        if (freqEl) freqEl.style.display = "none"
        waveformPlotter.hide()
        midiViewer.hide()

        // Show editor UI
        editorPanel.show()
        if (editOverlay) editOverlay.show()

        updateStaticFingers()
    }

    const exitEditMode = () => {
        isInEditMode = false
        editorPlaybackActive = false

        // Stop any ongoing editor playback
        editorPanel.hide() // internally stops playback via stopCb
        if (editOverlay) editOverlay.hide()
        guitar.clearStaticFingers()
        guitar.stopVisualization()

        // Restore normal panels
        const freqEl = document.getElementById("frequency-plot")
        if (freqEl) freqEl.style.display = "flex"
        if (showingMidi) {
            midiViewer.show()
        } else {
            waveformPlotter.show()
        }
    }

    // ── Wire edit toggle ──────────────────────────────────────────────────────
    editToggle.onToggle(async (editing) => {
        if (editing) {
            await enterEditMode()
        } else {
            exitEditMode()
        }
    })

    // ── Wire editor panel play / stop ─────────────────────────────────────────
    editorPanel.onPlay(() => {
        if (!audioController.jsonPlayer) return
        const data = editorState.serialize()
        audioController.jsonPlayer.loadData(data)
        audioController.jsonPlayer.onPlay((t) => {
            guitar.load(data).then(() => guitar.startVisualization(t))
            guitar.clearStaticFingers()
            // Start the cyan playhead at the confirmed audio start time
            const maxTime = Math.max(
                0,
                ...data.tracks.flatMap((tr) =>
                    tr.notes.map((n) => n.time + n.duration),
                ),
            )
            editorPanel.startPlayhead(t, maxTime)
        })
        editorPlaybackActive = true
        audioController.jsonPlayer.play()
    })

    editorPanel.onStop(() => {
        editorPlaybackActive = false
        audioController.jsonPlayer?.stop()
        guitar.stopVisualization()
        editorPanel.clearPlayhead()
        updateStaticFingers()
    })

    // ── Wire save: persist to localStorage and surface in the selector ────────
    // ── Helper: upsert MY COMPOSITION into the modes list ────────────────────
    const upsertComposition = (data: JSONAudioFile): number => {
        const existingIndex = modes.findIndex(
            (m) => m.type === "json" && m.name === "MY COMPOSITION",
        )
        if (existingIndex >= 0) {
            const existing = modes[existingIndex] as JSONAudioMode
            existing.jsonData = data
            existing.loop = true
            return existingIndex
        } else {
            const newMode: AudioMode = {
                type: "json",
                name: "MY COMPOSITION",
                description: "Your saved composition",
                jsonData: data,
                loop: true,
            }
            modes.push(newMode)
            selector.appendMode(newMode)
            return modes.length - 1
        }
    }

    editorPanel.onSave((data) => {
        upsertComposition(data)
    })

    editorPanel.onClear(() => {
        localStorage.removeItem(STORAGE_KEY)
        selector.removeModeByName("MY COMPOSITION")
    })

    // ── Wire ↗ MAIN VIEW ────────────────────────────────────────────────────
    editorPanel.onMainView(async (data) => {
        const idx = upsertComposition(data)
        // Exit edit mode visually and logically
        exitEditMode()
        editToggle.setEditMode(false)
        // Ensure audio context is running
        await audioController.resumeAudioContext()
        // Navigate selector label and play
        selector.gotoIndex(idx)
        await playAudioMode(idx)
    })
})()

