import "./style.css"
import { Guitar } from "./components/guitar"
import { FrequencyPlotter } from "./components/frequency-plotter"
import { WaveformPlotter } from "./components/waveform-plotter"
import { AudioController } from "./audio/audio-controller"
import { audioModes } from "./audio/audio-modes"
;(async () => {
    const audioController = new AudioController()
    await audioController.init()

    // Create frequency plotter
    const plotter = new FrequencyPlotter("#frequency-plot", 300, 180)

    // Create waveform plotter
    const waveformPlotter = new WaveformPlotter("#waveform-plot", 400, 150)

    let animationFrameId: number | null = null
    let unsubscribeListener: (() => void) | null = null

    const startAnimationLoop = () => {
        const animate = () => {
            audioController.updateAnalyzerState()
            animationFrameId = requestAnimationFrame(animate)
        }
        animate()
    }

    const stopAnimationLoop = () => {
        if (animationFrameId !== null) {
            cancelAnimationFrame(animationFrameId)
            animationFrameId = null
        }
    }

    const onclick = async () => {
        // Trigger on user interaction to comply with browser autoplay policies
        await audioController.resumeAudioContext()

        // Register listener for plotter updates
        if (unsubscribeListener) unsubscribeListener()
        unsubscribeListener = audioController.onAnalyzerUpdate((state) => {
            plotter.updateBars(state)
            waveformPlotter.updateWaveform(state)
        })

        // Start animation loop for real-time updates
        stopAnimationLoop() // Clean up any previous loop
        startAnimationLoop()

        const audioMode = audioModes[1]

        if (audioMode.type === "midi") {
            await audioController.midiPlayer.load(
                audioMode.midiPath,
                audioMode.playConfig,
            )
            audioController.midiPlayer.play()
        } else if (audioMode.type === "json") {
            await audioController.jsonPlayer.load(
                audioMode.jsonPath,
                audioMode.playConfig,
                audioMode.loop,
            )
            audioController.jsonPlayer.play()
        }
    }

    const guitar = new Guitar(document.getElementById("app")!, onclick)
    guitar.addGuitar()
})()

