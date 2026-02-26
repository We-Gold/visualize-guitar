import * as Tone from "tone"
import { GuitarSampler } from "./guitar-sampler"
import { MidiPlayer } from "./midi-player"
import { LoopPlayer } from "./loop-player"
import { JSONPlayer } from "./json-player"

export interface AnalyzerState {
    fftValues: Float32Array
    waveformValues: Float32Array
    /** Per-string waveform data: index 0 = string 1, index 5 = string 6 */
    stringWaveformValues: Float32Array[]
}

export class AudioController {
    private ctx!: AudioContext
    private isInitialized = false
    private fftAnalyzer!: Tone.Analyser
    private waveformAnalyzer!: Tone.Analyser
    private stringWaveformAnalyzers: Tone.Analyser[] = []
    private analyzerState: AnalyzerState = {
        fftValues: new Float32Array(0),
        waveformValues: new Float32Array(0),
        stringWaveformValues: Array.from(
            { length: 6 },
            () => new Float32Array(0),
        ),
    }
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

        // Create and connect FFT analyzer to tap into the main output
        this.fftAnalyzer = new Tone.Analyser("fft")
        this.fftAnalyzer.size = 1024
        Tone.getDestination().connect(this.fftAnalyzer)

        // Create and connect waveform analyzer to tap into the main output
        this.waveformAnalyzer = new Tone.Analyser("waveform")
        this.waveformAnalyzer.size = 512
        Tone.getDestination().connect(this.waveformAnalyzer)

        // Create and load the guitar sampler
        this.guitarSampler = new GuitarSampler()
        await this.guitarSampler.load()

        // Create per-string waveform analyzers and connect to each string's sampler
        for (let stringNum = 1; stringNum <= 6; stringNum++) {
            const analyzer = new Tone.Analyser("waveform")
            analyzer.size = 512
            const stringSampler = this.guitarSampler.getStringSampler(stringNum)
            if (stringSampler) {
                stringSampler.connect(analyzer)
            }
            this.stringWaveformAnalyzers[stringNum - 1] = analyzer
        }

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
     * Update analyzer state by reading current FFT and waveform values and notifying listeners
     * Call this from a requestAnimationFrame loop for real-time updates
     */
    public updateAnalyzerState(): void {
        const fftData = this.fftAnalyzer.getValue() as Float32Array
        const waveformData = this.waveformAnalyzer.getValue() as Float32Array

        this.analyzerState.fftValues = fftData
        this.analyzerState.waveformValues = waveformData

        // Read per-string waveform data
        for (let i = 0; i < this.stringWaveformAnalyzers.length; i++) {
            this.analyzerState.stringWaveformValues[i] =
                this.stringWaveformAnalyzers[i].getValue() as Float32Array
        }

        // Notify all listeners
        this.analyzerListeners.forEach((callback) => {
            callback(this.analyzerState)
        })
    }
}

