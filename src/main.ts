import "./style.css"
import * as Tone from "tone"
import { Guitar } from "./components/guitar"
import { Selector } from "./components/selector"
import { FrequencyPlotter } from "./components/frequency-plotter"
import { WaveformPlotter } from "./components/waveform-plotter"
import { AudioController } from "./audio/audio-controller"
import { audioModes } from "./audio/audio-modes"
import { MidiViewer } from "./components/midi-viewer"

// ── Responsive scaling ───────────────────────────────────────────────────────
/** Viewport height at which the overlay panels are designed (MacBook Air dev baseline). */
const REFERENCE_HEIGHT = 862

function applyResponsiveScale(): void {
    const scale = Math.min(1, window.innerHeight / REFERENCE_HEIGHT)
    const panels: Array<{ id: string; origin: string }> = [
        { id: "frequency-plot", origin: "top right" },
        { id: "waveform-plot", origin: "bottom right" },
        { id: "midi-viewer", origin: "bottom right" },
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

    // Apply initial scale and keep in sync on resize
    applyResponsiveScale()
    window.addEventListener("resize", applyResponsiveScale)

    // Toggle between waveform and MIDI views
    let showingMidi = false
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

    const startAnimationLoop = () => {
        const animate = () => {
            audioController.updateAnalyzerState()
            guitar.updateVisuals(Tone.now())
            midiViewer.updateVisuals(Tone.now())
            requestAnimationFrame(animate)
        }
        animate()
    }

    let currentPlayId = 0

    const playAudioMode = async (index: number) => {
        const playId = ++currentPlayId

        // Fade out and stop current audio, then clear visuals
        await audioController.fadeOutAndStop()
        guitar.stopVisualization()
        midiViewer.stopVisualization()

        // Brief silence gap before starting the next mode
        await new Promise<void>((resolve) => setTimeout(resolve, 500))
        if (playId !== currentPlayId) return

        const audioMode = audioModes[index]

        if (audioMode.type === "midi") {
            await audioController.midiPlayer.load(
                audioMode.midiPath,
                audioMode.playConfig,
            )
            if (playId !== currentPlayId) return
            audioController.midiPlayer.play()
        } else if (audioMode.type === "json") {
            // Load audio data and pass to guitar visualizer
            const response = await fetch(audioMode.jsonPath)
            if (playId !== currentPlayId) return
            const jsonData = await response.json()
            await guitar.load(
                jsonData,
                audioMode.playConfig?.durationMultiplier,
            )
            midiViewer.load(jsonData, audioMode.playConfig?.durationMultiplier)
            if (playId !== currentPlayId) return

            await audioController.jsonPlayer.load(
                audioMode.jsonPath,
                audioMode.playConfig,
                audioMode.loop,
            )
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
    const selectorContainer = document.createElement("div")
    selectorContainer.id = "selector-container"
    document.getElementById("app")!.appendChild(selectorContainer)
    const selector = new Selector(selectorContainer)
    selector.addSelector(audioModes, onStart, onModeChange)

    const guitar = new Guitar(document.getElementById("app")!)
    guitar.addGuitar()
})()

