import * as Tone from "tone"
import { Midi } from "@tonejs/midi"
import { GuitarSampler } from "./guitar-sampler"

type PlayConfig = {
    durationMultiplier?: number
    velocityMultiplier?: number
}

export class MidiPlayer {
    private sampler: GuitarSampler
    private midi?: Midi
    private isPlaying = false
    private playConfig: PlayConfig = {
        durationMultiplier: 1,
        velocityMultiplier: 1,
    }

    constructor(sampler: GuitarSampler) {
        this.sampler = sampler
    }

    async load(midiPath: string, playConfig?: PlayConfig): Promise<void> {
        this.playConfig = playConfig ?? this.playConfig
        try {
            const response = await fetch(midiPath)
            const arrayBuffer = await response.arrayBuffer()
            this.midi = new Midi(arrayBuffer)
        } catch (error) {
            console.error("Failed to load MIDI file:", error)
            throw error
        }
    }

    async play(): Promise<void> {
        if (!this.midi) {
            console.warn("No MIDI file loaded. Call load() first.")
            return
        }

        if (this.isPlaying) {
            console.warn("Already playing MIDI")
            return
        }

        this.isPlaying = true
        const now = Tone.now()

        try {
            // Schedule all notes from all tracks
            this.midi.tracks.forEach((track) => {
                track.notes.forEach((note) => {
                    this.sampler.play(
                        note.name,
                        note.duration * this.playConfig.durationMultiplier!,
                        now + note.time,
                        note.velocity * this.playConfig.velocityMultiplier!,
                    )
                })
            })

            // Calculate total duration and mark as done when complete
            const maxTime = Math.max(
                ...this.midi.tracks.flatMap((track) =>
                    track.notes.map((note) => note.time + note.duration),
                ),
            )

            setTimeout(() => {
                this.isPlaying = false
            }, maxTime * 1000)
        } catch (error) {
            console.error("Error playing MIDI:", error)
            this.isPlaying = false
        }
    }

    stop(): void {
        this.isPlaying = false
    }

    isCurrentlyPlaying(): boolean {
        return this.isPlaying
    }
}

