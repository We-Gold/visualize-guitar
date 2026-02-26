import * as Tone from "tone"

// Build sampler mapping from guitar samples
function buildGuitarSamplerMap(): Record<string, string> {
    const noteToSample: Record<string, string> = {
        G1: "G1",
        "G#1": "Gs1",
        A1: "A1",
        "A#1": "As1",
        B1: "B1",
        C2: "C2",
        "C#2": "Cs2",
        D2: "D2",
        "D#2": "Ds2",
        E2: "E2",
        F2: "F2",
        G2: "G2",
        A2: "A2",
        B2: "B2",
        C3: "C3",
        D3: "D3",
        E3: "E3",
        F3: "F3",
        "F#3": "Fs3",
        G3: "G3",
        "G#3": "Gs3",
        A3: "A3",
        "A#3": "As3",
        B3: "B3",
        C4: "C4",
        "C#4": "Cs4",
        D4: "D4",
        "D#4": "Ds4",
        E4: "E4",
        F4: "F4",
        "F#4": "Fs4",
        G4: "G4",
        A4: "A4",
        "A#4": "As4",
        B4: "B4",
        C5: "C5",
        "C#5": "Cs5",
        D5: "D5",
        "D#5": "Ds5",
        E5: "E5",
        F5: "F5",
        "F#5": "Fs5",
        G5: "G5",
        "G#5": "Gs5",
        A5: "A5",
        "A#5": "As5",
        B5: "B5",
        C6: "C6",
    }

    const map: Record<string, string> = {}
    for (const [noteName, sampleName] of Object.entries(noteToSample)) {
        map[noteName] = `${sampleName}.mp3`
    }
    return map
}

export class GuitarSampler {
    private sampler?: Tone.Sampler
    private stringSamplers: Map<number, Tone.Sampler> = new Map()
    private synth?: Tone.Synth
    private isReady = false

    async load(): Promise<void> {
        // Create synth as fallback
        this.synth = new Tone.Synth({
            oscillator: { type: "triangle" },
            envelope: {
                attack: 0.02,
                decay: 0.4,
                sustain: 0.1,
                release: 0.8,
            },
        })

        // Add low-pass filter for acoustic guitar warmth
        const filter = new Tone.Filter({
            frequency: 3000,
            type: "lowpass",
        }).toDestination()

        this.synth.connect(filter)

        // Create sampler with real guitar samples
        try {
            this.sampler = new Tone.Sampler({
                urls: buildGuitarSamplerMap(),
                baseUrl: "/guitar/samples/",
                // release: 1,
            }).toDestination()

            // Create per-string samplers (strings 1–6) for individual waveform analysis
            for (let stringNum = 1; stringNum <= 6; stringNum++) {
                const stringSampler = new Tone.Sampler({
                    urls: buildGuitarSamplerMap(),
                    baseUrl: "/guitar/samples/",
                }).toDestination()
                this.stringSamplers.set(stringNum, stringSampler)
            }

            // Wait for all samples (main + per-string) to load
            await Tone.loaded()
            this.isReady = true
        } catch (error) {
            console.error("Failed to create guitar sampler:", error)
            this.isReady = true // Still ready, will use fallback synth
        }
    }

    play(
        noteName: string,
        duration: number | string,
        time: number = Tone.now(),
        velocity: number = 0.8,
    ): void {
        try {
            if (this.sampler) {
                this.sampler.triggerAttackRelease(
                    noteName,
                    duration,
                    time,
                    velocity,
                )
            } else if (this.synth) {
                this.synth.triggerAttackRelease(noteName, duration, time)
            }
        } catch (error) {
            console.warn("Error playing note, falling back to synth:", error)
            if (this.synth) {
                this.synth.triggerAttackRelease(noteName, duration, time)
            }
        }
    }

    isLoaded(): boolean {
        return this.isReady
    }

    /**
     * Returns the Tone.Sampler dedicated to the given string number (1–6).
     * AudioController uses this to connect per-string waveform analyzers.
     */
    getStringSampler(stringNum: number): Tone.Sampler | undefined {
        return this.stringSamplers.get(stringNum)
    }

    /**
     * Play a note routed through the per-string sampler so that
     * per-string waveform analyzers can capture it individually.
     */
    playOnString(
        stringNum: number,
        noteName: string,
        duration: number | string,
        time: number = Tone.now(),
        velocity: number = 0.8,
    ): void {
        const stringSampler = this.stringSamplers.get(stringNum)
        try {
            if (stringSampler) {
                stringSampler.triggerAttackRelease(
                    noteName,
                    duration,
                    time,
                    velocity,
                )
            } else {
                // Fallback to shared sampler if per-string sampler not available
                this.play(noteName, duration, time, velocity)
            }
        } catch (error) {
            console.warn(
                "Error playing note on string sampler, falling back:",
                error,
            )
            this.play(noteName, duration, time, velocity)
        }
    }
}

