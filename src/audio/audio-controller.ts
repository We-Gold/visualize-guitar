import * as Tone from "tone"
import { GuitarSampler } from "./guitar-sampler"
import { MidiPlayer } from "./midi-player"
import { LoopPlayer } from "./loop-player"
import { JSONPlayer } from "./json-player"

export interface AnalyzerState {
    fftValues: Float32Array
}

export class AudioController {
    private ctx!: AudioContext
    private isInitialized = false
    private analyzer!: Tone.Analyser
    private analyzerState: AnalyzerState = { fftValues: new Float32Array(0) }
    private analyzerListeners: Array<(state: AnalyzerState) => void> = []

    public guitarSampler!: GuitarSampler
    public midiPlayer!: MidiPlayer
    public loopPlayer!: LoopPlayer
    public jsonPlayer!: JSONPlayer

    async init() {
        // Create AudioContext (will be suspended until user gesture)
        this.ctx = new (
            window.AudioContext || (window as any).webkitAudioContext
        )()
        // Set Tone.js to use our AudioContext
        Tone.setContext(this.ctx)
    }

    async resumeAudioContext() {
        // Resume the context if suspended
        if (this.ctx.state === "suspended") {
            await this.ctx.resume()
        }

        // Start Tone.js audio processing
        await Tone.start()

        // Only initialize instruments once
        if (this.isInitialized) return
        this.isInitialized = true

        // Wait a moment for the context to be fully ready
        await new Promise((resolve) => setTimeout(resolve, 100))

        // Create and connect the analyzer to tap into the main output
        this.analyzer = new Tone.Analyser("fft")
        this.analyzer.size = 1024
        Tone.getDestination().connect(this.analyzer)

        // Create and load the guitar sampler
        this.guitarSampler = new GuitarSampler()
        await this.guitarSampler.load()

        // Create the players
        this.midiPlayer = new MidiPlayer(this.guitarSampler)
        this.loopPlayer = new LoopPlayer(this.guitarSampler)
        this.jsonPlayer = new JSONPlayer(this.guitarSampler)
    }

    /**
     * Get the current analyzer state containing FFT data
     */
    public getAnalyzerState(): AnalyzerState {
        return this.analyzerState
    }

    /**
     * Register a listener that will be called when analyzer state updates
     */
    public onAnalyzerUpdate(
        callback: (state: AnalyzerState) => void,
    ): () => void {
        this.analyzerListeners.push(callback)
        // Return an unsubscribe function
        return () => {
            this.analyzerListeners = this.analyzerListeners.filter(
                (c) => c !== callback,
            )
        }
    }

    /**
     * Update analyzer state by reading current FFT values and notifying listeners
     * Call this from a requestAnimationFrame loop for real-time updates
     */
    public updateAnalyzerState(): void {
        const fftData = this.analyzer.getValue() as Float32Array
        this.analyzerState.fftValues = fftData

        // Notify all listeners
        this.analyzerListeners.forEach((callback) => {
            callback(this.analyzerState)
        })
    }
}

