import "./style.css"
import { Guitar } from "./components/guitar"
import { AudioController } from "./components/audio-controller"
;(async () => {
    const audioController = new AudioController()
    await audioController.init()

    const onclick = async () => {
        // Trigger on user interaction to comply with browser autoplay policies
        await audioController.resumeAudioContext()

        await audioController.midiPlayer.load("/the-last-of-us-tab.mid", {
            durationMultiplier: 2.5,
            velocityMultiplier: 0.7,
        })
        audioController.midiPlayer.play()
    }

    const guitar = new Guitar(document.getElementById("app")!, onclick)
    guitar.addGuitarOutline()
})()

