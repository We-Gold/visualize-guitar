import "./style.css"
import { Guitar } from "./components/guitar"
import { AudioController } from "./components/audio-controller"
;(async () => {
    const audioController = new AudioController()
    await audioController.init()
    // audioController.setMode("sine")
    audioController.setMode("guitar")

    // A4 note (440 Hz), B4 note (493.88 Hz), C5 note (523.25 Hz)

    const onclick = () => {
        audioController.startLoop(523.25)
    }

    const guitar = new Guitar(document.getElementById("app")!, onclick)
    guitar.addGuitarOutline()
})()

