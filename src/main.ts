import "./style.css"
import { addGuitarOutline } from "./components/guitar"

document.querySelector<HTMLDivElement>("#app")!.innerHTML = `
    <div>
        <h1>Visualize how a guitar works</h1>
    </div>
    <div id="background"></div>
`

addGuitarOutline(document.getElementById("app")!)

