// import guitarOutline from "../assets/guitar-outline.svg"
import guitar from "../assets/Guitar.svg"

export const addGuitarOutline = (container: HTMLElement) => {
    const img = document.createElement("img")
    img.src = guitar
    img.alt = "Guitar Outline"
    img.style.width = "80%"
    img.style.height = "auto"
    img.style.position = "absolute"
    img.style.top = "50%"
    img.style.left = "55%"
    img.style.transform = "translate(-50%, -50%)"
    container.appendChild(img)
}

