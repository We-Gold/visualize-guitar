export interface MidiAudioMode {
    type: "midi"
    name: string
    description?: string
    midiPath: string
    playConfig?: {
        durationMultiplier?: number
        velocityMultiplier?: number
    }
}

export interface JSONAudioMode {
    type: "json"
    name: string
    description?: string
    jsonPath: string
    playConfig?: {
        durationMultiplier?: number
        velocityMultiplier?: number
    }
    loop?: boolean | { intervalSeconds?: number }
}

export type AudioMode = MidiAudioMode | JSONAudioMode

export const audioModes: AudioMode[] = [
    {
        type: "json",
        name: "ONE STRING",
        description: "Loop E2",
        jsonPath: `${import.meta.env.BASE_URL}data/loop-e2.json`,
        loop: { intervalSeconds: 1 },
    },
    {
        type: "json",
        name: "ALL OPEN STRINGS",
        description: "E2 A2 D3 G3 B3 E4",
        jsonPath: `${import.meta.env.BASE_URL}data/open-strings.json`,
        loop: { intervalSeconds: 2 },
        playConfig: {
            durationMultiplier: 2.5,
            velocityMultiplier: 1,
        },
    },
    {
        type: "json",
        name: "ONE STRING, ALL FRETS",
        description: "E minor pentatonic on low E",
        jsonPath: `${import.meta.env.BASE_URL}data/pentatonic-string6.json`,
        loop: { intervalSeconds: 1.5 },
        playConfig: {
            durationMultiplier: 1.5,
            velocityMultiplier: 1,
        },
    },
    {
        type: "json",
        name: "E MINOR CHORD",
        description: "Arpeggiated, then strummed",
        jsonPath: `${import.meta.env.BASE_URL}data/em-chord.json`,
        loop: { intervalSeconds: 2 },
    },
    {
        type: "json",
        name: "CHORD PROGRESSION",
        description: "Em → Am → C → G",
        jsonPath: `${import.meta.env.BASE_URL}data/chord-progression.json`,
        loop: { intervalSeconds: 2 },
    },
    {
        type: "json",
        name: "THE LAST OF US (BASIC)",
        jsonPath: `${import.meta.env.BASE_URL}data/the-last-of-us-string1.json`,
        loop: { intervalSeconds: 2 },
        playConfig: {
            durationMultiplier: 2.5,
            velocityMultiplier: 0.7,
        },
    },
    {
        type: "json",
        name: "THE LAST OF US (FULL)",
        jsonPath: `${import.meta.env.BASE_URL}data/the-last-of-us.json`,
        playConfig: {
            durationMultiplier: 2.5,
            velocityMultiplier: 0.7,
        },
    },
]

export interface JSONAudioFile {
    meta?: {
        title: string
        tempo: number
        timeSignature: [number, number]
        tuning: number[]
    }
    tracks: {
        name: string
        notes: {
            id?: number
            duration: number
            durationTicks?: number
            midi: number
            name: string
            ticks?: number
            time: number
            velocity: number
            string: number
            fret: number
        }[]
    }[]
}

