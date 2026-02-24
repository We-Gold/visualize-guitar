export interface MidiAudioMode {
    type: "midi"
    name: string
    midiPath: string
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

export type AudioMode = MidiAudioMode | LoopAudioMode

export const audioModes: AudioMode[] = [
    {
        type: "loop",
        name: "Loop E2",
        noteName: "E2",
        intervalSeconds: 3,
    },
    {
        type: "midi",
        name: "The Last of Us",
        midiPath: "/the-last-of-us-tab.mid",
        playConfig: {
            durationMultiplier: 2.5,
            velocityMultiplier: 0.7,
        },
    },
]

