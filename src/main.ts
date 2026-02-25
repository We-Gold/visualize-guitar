import "./style.css"
import { Guitar } from "./components/guitar"
import { AudioController } from "./audio/audio-controller"
import { audioModes } from "./audio/audio-modes"
;(async () => {
    const audioController = new AudioController()
    await audioController.init()

    const onclick = async () => {
        // Trigger on user interaction to comply with browser autoplay policies
        await audioController.resumeAudioContext()

        const audioMode = audioModes[3]

        if (audioMode.type === "midi") {
            await audioController.midiPlayer.load(
                audioMode.midiPath,
                audioMode.playConfig,
            )
            audioController.midiPlayer.play()
        } else if (audioMode.type === "json") {
            await audioController.jsonPlayer.load(
                audioMode.jsonPath,
                audioMode.playConfig,
            )
            audioController.jsonPlayer.play()
        } else if (audioMode.type === "loop") {
            audioController.loopPlayer.play(
                audioMode.noteName,
                audioMode.intervalSeconds,
            )
        }
    }

    const guitar = new Guitar(document.getElementById("app")!, onclick)
    guitar.addGuitarOutline()
})()

