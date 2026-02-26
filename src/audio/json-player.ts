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
    private shouldLoop = false
    private loopConfig?: boolean | { intervalSeconds?: number }
    private playTimeoutId?: number
    private playStartTime = 0
    private onPlayCallback?: (playStartTime: number) => void
    private playConfig: PlayConfig = {
        durationMultiplier: 1,
        velocityMultiplier: 1,
    }

    constructor(sampler: GuitarSampler) {
        this.sampler = sampler
    }

    async load(
        jsonPath: string,
        playConfig?: PlayConfig,
        loopConfig?: boolean | { intervalSeconds?: number },
    ): Promise<void> {
        this.playConfig = playConfig ?? this.playConfig
        this.loopConfig = loopConfig
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
        this.shouldLoop = !!this.loopConfig
        const now = Tone.now()
        this.playStartTime = now
        this.onPlayCallback?.(this.playStartTime)

        try {
            // Schedule all notes from all tracks, routed through per-string samplers
            this.jsonData.tracks.forEach((track) => {
                track.notes.forEach((note) => {
                    this.sampler.playOnString(
                        note.string,
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

            this.playTimeoutId = window.setTimeout(() => {
                this.isPlaying = false

                // Handle looping if configured
                if (this.shouldLoop && this.loopConfig) {
                    const loopInterval =
                        typeof this.loopConfig === "object"
                            ? (this.loopConfig.intervalSeconds ?? maxTime)
                            : maxTime

                    this.playTimeoutId = window.setTimeout(() => {
                        if (this.shouldLoop) {
                            this.play()
                        }
                    }, loopInterval * 1000)
                }
            }, maxTime * 1000)
        } catch (error) {
            console.error("Error playing JSON data:", error)
            this.isPlaying = false
        }
    }

    stop(): void {
        this.shouldLoop = false
        this.isPlaying = false
        if (this.playTimeoutId !== undefined) {
            window.clearTimeout(this.playTimeoutId)
            this.playTimeoutId = undefined
        }
    }

    setLooping(enabled: boolean): void {
        this.shouldLoop = enabled
    }

    getLooping(): boolean {
        return this.shouldLoop
    }

    isCurrentlyPlaying(): boolean {
        return this.isPlaying
    }

    getPlayStartTime(): number {
        return this.playStartTime
    }

    onPlay(cb: (playStartTime: number) => void): void {
        this.onPlayCallback = cb
    }
}

