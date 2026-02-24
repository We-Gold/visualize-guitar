import * as Tone from "tone"
import { GuitarSampler } from "./guitar-sampler"

export class LoopPlayer {
    private sampler: GuitarSampler
    private isPlaying = false
    private intervalId?: ReturnType<typeof setInterval>

    constructor(sampler: GuitarSampler) {
        this.sampler = sampler
    }

    play(noteName: string, intervalSeconds: number = 2): void {
        if (this.isPlaying) {
            console.warn("Loop already playing. Call stop() first.")
            return
        }

        this.isPlaying = true
        const duration = Math.min(intervalSeconds * 0.8, 1) // Use 80% of interval or 0.4s

        // Play first note immediately
        this.sampler.play(noteName, duration, Tone.now())

        // Then loop with interval
        this.intervalId = setInterval(() => {
            if (this.isPlaying) {
                this.sampler.play(noteName, duration, Tone.now())
            }
        }, intervalSeconds * 1000)
    }

    stop(): void {
        this.isPlaying = false
        if (this.intervalId) {
            clearInterval(this.intervalId)
            this.intervalId = undefined
        }
    }

    isCurrentlyPlaying(): boolean {
        return this.isPlaying
    }
}

