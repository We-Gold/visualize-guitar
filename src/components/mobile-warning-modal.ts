const MOBILE_WARNING_KEY = "visualize-guitar-mobile-warning-ack"

/**
 * A full-screen, non-dismissible warning shown once on mobile devices,
 * explaining that the site is designed for laptop-size screens and may
 * have performance issues on mobile. Acknowledging it persists via
 * localStorage so it won't show again on future visits.
 */
export class MobileWarningModal {
    constructor() {
        if (localStorage.getItem(MOBILE_WARNING_KEY)) return

        const backdrop = this.buildBackdrop()
        const card = this.buildCard(() => {
            try {
                localStorage.setItem(MOBILE_WARNING_KEY, "1")
            } catch {
                // non-fatal
            }
            backdrop.remove()
            card.remove()
        })

        document.body.appendChild(backdrop)
        document.body.appendChild(card)
    }

    private buildBackdrop(): HTMLDivElement {
        const el = document.createElement("div")
        Object.assign(el.style, {
            position: "fixed",
            inset: "0",
            backdropFilter: "blur(10px)",
            background:
                "radial-gradient(circle farthest-corner at 50% 40%, rgba(60,60,60,0.88) 0%, rgba(0,0,0,0.85) 100%)",
            zIndex: "200",
        })
        return el
    }

    private buildCard(onAcknowledge: () => void): HTMLDivElement {
        const card = document.createElement("div")
        Object.assign(card.style, {
            position: "fixed",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            zIndex: "201",
            padding: "36px 32px",
            maxWidth: "420px",
            width: "calc(100vw - 48px)",
            fontFamily: "'Inconsolata', monospace",
            color: "white",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            textAlign: "center",
            gap: "20px",
        })

        const body = document.createElement("div")
        Object.assign(body.style, {
            fontSize: "17px",
            lineHeight: "1.7",
            color: "rgba(255,255,255,0.92)",
        })
        body.textContent =
            "This site is designed for laptop-size screens. On mobile, some panels are hidden and you may notice performance issues."
        card.appendChild(body)

        const soundWarning = document.createElement("div")
        Object.assign(soundWarning.style, {
            fontSize: "15px",
            lineHeight: "1.6",
            fontStyle: "italic",
            color: "rgba(255,255,255,0.75)",
        })
        soundWarning.textContent = "Also, make sure silent mode is off."
        card.appendChild(soundWarning)

        const button = document.createElement("div")
        Object.assign(button.style, {
            marginTop: "8px",
            padding: "10px 16px",
            textAlign: "center",
            fontSize: "12px",
            letterSpacing: "0.08em",
            color: "white",
            background: "rgba(255,255,255,0.10)",
            border: "1px solid rgba(255,255,255,0.30)",
            borderRadius: "4px",
            cursor: "pointer",
            userSelect: "none",
            transition: "background 0.15s",
        })
        button.textContent = "I UNDERSTAND, CONTINUE"
        button.addEventListener("mouseenter", () => {
            button.style.background = "rgba(255,255,255,0.18)"
        })
        button.addEventListener("mouseleave", () => {
            button.style.background = "rgba(255,255,255,0.10)"
        })
        button.addEventListener("click", onAcknowledge)
        card.appendChild(button)

        return card
    }
}
