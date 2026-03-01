import "./style.css"
import * as Tone from "tone"
import { Guitar } from "./components/guitar"
import { Selector } from "./components/selector"
import { FrequencyPlotter } from "./components/frequency-plotter"
import { WaveformPlotter } from "./components/waveform-plotter"
import { AudioController } from "./audio/audio-controller"
import { audioModes } from "./audio/audio-modes"
;(async () => {
    const audioController = new AudioController()
    await audioController.init()

    // Create frequency plotter
    const plotter = new FrequencyPlotter("#frequency-plot")

    // Create waveform plotter
    const waveformPlotter = new WaveformPlotter("#waveform-plot")
    waveformPlotter.setMode("per-string")

    let unsubscribeListener: (() => void) | null = null

    const startAnimationLoop = () => {
        const animate = () => {
            audioController.updateAnalyzerState()
            guitar.updateVisuals(Tone.now())
            requestAnimationFrame(animate)
        }
        animate()
    }

    const playAudioMode = async (index: number) => {
        // Stop any currently playing audio and clear visuals
        audioController.jsonPlayer.stop()
        guitar.stopVisualization()

        const audioMode = audioModes[index]

        if (audioMode.type === "midi") {
            await audioController.midiPlayer.load(
                audioMode.midiPath,
                audioMode.playConfig,
            )
            audioController.midiPlayer.play()
        } else if (audioMode.type === "json") {
            // Load audio data and pass to guitar visualizer
            const response = await fetch(audioMode.jsonPath)
            const jsonData = await response.json()
            await guitar.load(
                jsonData,
                audioMode.playConfig?.durationMultiplier,
            )

            await audioController.jsonPlayer.load(
                audioMode.jsonPath,
                audioMode.playConfig,
                audioMode.loop,
            )
            // Re-sync the visualizer on every loop iteration
            audioController.jsonPlayer.onPlay((t) =>
                guitar.startVisualization(t),
            )
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

