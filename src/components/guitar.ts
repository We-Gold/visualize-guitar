import * as d3 from "d3"

const GUITAR_SVG_PATH = "./img/Guitar.svg"

export class Guitar {
    private container: HTMLElement

    constructor(container: HTMLElement, onclick?: () => void) {
        this.container = container
        if (onclick) {
            this.container.addEventListener("click", onclick)
        }
    }

    addGuitar() {
        d3.xml(GUITAR_SVG_PATH).then((xml) => {
            const svg = xml.documentElement
            svg.style.zIndex = "1"
            this.container.appendChild(svg)
        })
    }
}

