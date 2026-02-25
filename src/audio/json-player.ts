import * as Tone from "tone"
import { type JSONAudioFile } from "./audio-modes"
import { GuitarSampler } from "./guitar-sampler"

type PlayConfig = {
    durationMultiplier?: number
    velocityMultiplier?: number
}

export class JSONPlayer {
    private sampler: GuitarSampler
    private jsonData?: JSONAudioFile
    private isPlaying = false
    private playConfig: PlayConfig = {
        durationMultiplier: 1,
        velocityMultiplier: 1,
    }

    constructor(sampler: GuitarSampler) {
        this.sampler = sampler
    }

    async load(jsonPath: string, playConfig?: PlayConfig): Promise<void> {
        this.playConfig = playConfig ?? this.playConfig
        try {
            const response = await fetch(jsonPath)
            const jsonData = await response.json()
            this.jsonData = jsonData
        } catch (error) {
            console.error("Failed to load JSON file:", error)
            throw error
        }
    }

    async play(): Promise<void> {
        if (!this.jsonData) {
            console.warn("No JSON file loaded. Call load() first.")
            return
        }

        if (this.isPlaying) {
            console.warn("Already playing JSON data")
            return
        }

        this.isPlaying = true
        const now = Tone.now()

        try {
            // Schedule all notes from all tracks
            this.jsonData.tracks.forEach((track) => {
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
                ...this.jsonData.tracks.flatMap((track) =>
                    track.notes.map((note) => note.time + note.duration),
                ),
            )

            setTimeout(() => {
                this.isPlaying = false
            }, maxTime * 1000)
        } catch (error) {
            console.error("Error playing JSON data:", error)
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

