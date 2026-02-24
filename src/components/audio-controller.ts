import * as Tone from "tone"
import { GuitarSampler } from "./guitar-sampler"
import { MidiPlayer } from "./midi-player"
import { LoopPlayer } from "./loop-player"

export class AudioController {
    private ctx!: AudioContext
    private isInitialized = false

    public guitarSampler!: GuitarSampler
    public midiPlayer!: MidiPlayer
    public loopPlayer!: LoopPlayer

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

        // Create and load the guitar sampler
        this.guitarSampler = new GuitarSampler()
        await this.guitarSampler.load()

        // Create the players
        this.midiPlayer = new MidiPlayer(this.guitarSampler)
        this.loopPlayer = new LoopPlayer(this.guitarSampler)
    }
}

