export interface MidiAudioMode {
    type: "midi"
    name: string
    midiPath: string
    playConfig?: {
        durationMultiplier?: number
        velocityMultiplier?: number
    }
}

export interface JSONAudioMode {
    type: "json"
    name: string
    jsonPath: string
    playConfig?: {
        durationMultiplier?: number
        velocityMultiplier?: number
    }
}

export interface LoopAudioMode {
    type: "loop"
    name: string
    noteName: string
    intervalSeconds?: number
}

export type AudioMode = MidiAudioMode | LoopAudioMode | JSONAudioMode

export const audioModes: AudioMode[] = [
    {
        type: "loop",
        name: "Loop E2",
        noteName: "E2",
        intervalSeconds: 3,
    },
    {
        type: "json",
        name: "The Last of Us (JSON)",
        jsonPath: "/data/the-last-of-us.json",
        playConfig: {
            durationMultiplier: 2.5,
            velocityMultiplier: 0.7,
        },
    },
]

export interface JSONAudioFile {
    meta: {
        title: string
        tempo: number
        timeSignature: [number, number]
        tuning: number[]
    }
    tracks: {
        name: string
        notes: {
            id: number
            duration: number
            midi: number
            name: string
            time: number
            velocity: number
            string: number
            fret: number
        }[]
    }[]
}

