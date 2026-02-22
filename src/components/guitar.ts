import guitarOutline from "../assets/guitar-outline.svg"

export const addGuitarOutline = (container: HTMLElement) => {
    const img = document.createElement("img")
    img.src = guitarOutline
    img.alt = "Guitar Outline"
    img.style.position = "absolute"
    img.style.top = "50%"
    img.style.left = "60%"
    img.style.transform = "translate(-50%, -50%)"
    container.appendChild(img)
}

