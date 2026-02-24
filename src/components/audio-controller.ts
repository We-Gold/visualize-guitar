type Mode = "sine" | "guitar"

export class AudioController {
    private ctx!: AudioContext
    private mode: Mode = "sine"

    private isRunning = false
    private tempoIntervalSeconds = 2
    private nextNoteTime = 0
    private schedulerId?: number

    async init() {
        this.ctx = new AudioContext()
        await this.ctx.resume()
    }

    setMode(mode: Mode) {
        this.mode = mode
    }

    startLoop(frequency: number) {
        if (this.isRunning) return

        this.isRunning = true
        this.nextNoteTime = this.ctx.currentTime

        const scheduleAheadTimeSeconds = 0.1

        const scheduler = () => {
            while (
                this.nextNoteTime <
                this.ctx.currentTime + scheduleAheadTimeSeconds
            ) {
                this.playNote(this.nextNoteTime, frequency)
                this.nextNoteTime += this.tempoIntervalSeconds
            }

            this.schedulerId = window.setTimeout(scheduler, 25)
        }

        scheduler()
    }

    stopLoop() {
        this.isRunning = false
        if (this.schedulerId) clearTimeout(this.schedulerId)
    }

    private playNote(time: number, frequency: number) {
        if (this.mode === "sine") {
            this.playSine(time, frequency)
        } else {
            this.playGuitar(time, frequency)
        }
    }

    private playSine(time: number, frequency: number) {
        const osc = this.ctx.createOscillator()
        const gain = this.ctx.createGain()

        osc.frequency.value = frequency
        osc.type = "sine"

        gain.gain.setValueAtTime(0, time)
        gain.gain.linearRampToValueAtTime(0.5, time + 0.01)
        gain.gain.exponentialRampToValueAtTime(0.001, time + 0.8)

        osc.connect(gain)
        gain.connect(this.ctx.destination)

        osc.start(time)
        osc.stop(time + 1)
    }

    /**
     * Basic Guitar (Karplus-Strong-ish)
     */
    private playGuitar(time: number, frequency: number, gainValue = 0.2) {
        const duration = 1
        const bufferSize = this.ctx.sampleRate * duration
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate)
        const data = buffer.getChannelData(0)

        const delayLength = Math.floor(this.ctx.sampleRate / frequency)

        // Initial noise burst
        for (let i = 0; i < delayLength; i++) {
            data[i] = Math.random() * 2 - 1
        }

        // Karplus-Strong loop
        for (let i = delayLength; i < bufferSize; i++) {
            data[i] =
                0.996 *
                0.5 *
                (data[i - delayLength] + data[i - delayLength + 1])
        }

        const source = this.ctx.createBufferSource()
        source.buffer = buffer

        const gain = this.ctx.createGain()
        gain.gain.setValueAtTime(gainValue, time)
        gain.gain.exponentialRampToValueAtTime(0.001, time + duration)

        source.connect(gain)
        gain.connect(this.ctx.destination)

        source.start(time)
    }
}

