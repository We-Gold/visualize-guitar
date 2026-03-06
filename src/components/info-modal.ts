import { makeSvgEl } from "../utils/svg"

/**
 * A fixed info button (top-right corner) that opens a centered modal
 * describing the purpose of the website, with links to the process book
 * and project video.
 */
export class InfoModal {
    private btn: HTMLDivElement
    private backdrop: HTMLDivElement
    private card: HTMLDivElement
    private visible = false

    constructor() {
        this.btn = this.buildButton()
        this.backdrop = this.buildBackdrop()
        this.card = this.buildCard()

        document.body.appendChild(this.btn)
        document.body.appendChild(this.backdrop)
        document.body.appendChild(this.card)

        this.btn.addEventListener("click", () => this.toggle())
        this.backdrop.addEventListener("click", () => this.hide())
    }

    // ── Button ────────────────────────────────────────────────────────────────

    private buildButton(): HTMLDivElement {
        const btn = document.createElement("div")
        btn.id = "info-modal-btn"
        btn.title = "About this project"

        Object.assign(btn.style, {
            position: "fixed",
            top: "20px",
            right: "20px",
            width: "36px",
            height: "36px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            borderRadius: "50%",
            border: "1px solid rgba(255,255,255,0.20)",
            background: "rgba(255,255,255,0.06)",
            transition: "background 0.15s, border-color 0.15s",
            userSelect: "none",
            zIndex: "20",
            flexShrink: "0",
        })

        btn.appendChild(this.buildIcon())

        btn.addEventListener("mouseenter", () => {
            if (!this.visible) btn.style.background = "rgba(255,255,255,0.12)"
        })
        btn.addEventListener("mouseleave", () => {
            if (!this.visible) btn.style.background = "rgba(255,255,255,0.06)"
        })

        return btn
    }

    private buildIcon(): SVGSVGElement {
        const W = 20,
            H = 20
        const svg = makeSvgEl("svg", {
            width: W,
            height: H,
            viewBox: `0 0 ${W} ${H}`,
        }) as SVGSVGElement
        svg.style.overflow = "visible"

        const g = makeSvgEl("g", {
            stroke: "rgba(255,255,255,0.60)",
            "stroke-width": "1.3",
            "stroke-linecap": "round",
            "stroke-linejoin": "round",
            fill: "none",
        }) as SVGGElement

        // Outer circle
        g.appendChild(
            makeSvgEl("circle", {
                cx: 10,
                cy: 10,
                r: 8,
                stroke: "rgba(255,255,255,0.60)",
            }),
        )

        // Dot above the bar
        g.appendChild(
            makeSvgEl("circle", {
                cx: 10,
                cy: 6.5,
                r: 1,
                fill: "rgba(255,255,255,0.60)",
                stroke: "none",
            }),
        )

        // Vertical bar
        g.appendChild(
            makeSvgEl("line", {
                x1: 10,
                y1: 9.5,
                x2: 10,
                y2: 14.5,
                stroke: "rgba(255,255,255,0.60)",
                "stroke-width": "1.5",
            }),
        )

        svg.appendChild(g)
        return svg
    }

    // ── Backdrop ──────────────────────────────────────────────────────────────

    private buildBackdrop(): HTMLDivElement {
        const el = document.createElement("div")
        Object.assign(el.style, {
            position: "fixed",
            inset: "0",
            background: "rgba(0,0,0,0.60)",
            zIndex: "100",
            display: "none",
        })
        return el
    }

    // ── Modal card ────────────────────────────────────────────────────────────

    private buildCard(): HTMLDivElement {
        const card = document.createElement("div")
        Object.assign(card.style, {
            position: "fixed",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            zIndex: "101",
            background: "rgba(0,0,0,0.75)",
            backdropFilter: "blur(8px)",
            border: "1px solid rgba(255,255,255,0.10)",
            borderRadius: "8px",
            padding: "28px 32px",
            maxWidth: "480px",
            width: "calc(100vw - 48px)",
            fontFamily: "'Inconsolata', monospace",
            color: "white",
            display: "none",
            flexDirection: "column",
            gap: "12px",
        })

        // ── Close button ──────────────────────────────────────────────────────
        const closeBtn = document.createElement("div")
        Object.assign(closeBtn.style, {
            position: "absolute",
            top: "12px",
            right: "14px",
            cursor: "pointer",
            fontSize: "13px",
            color: "rgba(255,255,255,0.45)",
            letterSpacing: "0.05em",
            transition: "color 0.15s",
            userSelect: "none",
        })
        closeBtn.textContent = "✕ CLOSE"
        closeBtn.addEventListener("mouseenter", () => {
            closeBtn.style.color = "rgba(255,255,255,0.85)"
        })
        closeBtn.addEventListener("mouseleave", () => {
            closeBtn.style.color = "rgba(255,255,255,0.45)"
        })
        closeBtn.addEventListener("click", () => this.hide())
        card.appendChild(closeBtn)

        // ── Title ─────────────────────────────────────────────────────────────
        const title = document.createElement("div")
        Object.assign(title.style, {
            fontSize: "18px",
            fontWeight: "700",
            letterSpacing: "0.15em",
            color: "#E7A85D",
            marginTop: "4px",
        })
        title.textContent = "VISUALIZE GUITAR"
        card.appendChild(title)

        // ── Subtitle ──────────────────────────────────────────────────────────
        const subtitle = document.createElement("div")
        Object.assign(subtitle.style, {
            fontSize: "12px",
            color: "rgba(255,255,255,0.45)",
            letterSpacing: "0.08em",
            marginTop: "-6px",
        })
        subtitle.textContent = "CS 4804 · Data Visualization · WPI"
        card.appendChild(subtitle)

        // ── Divider ───────────────────────────────────────────────────────────
        const hr = document.createElement("div")
        Object.assign(hr.style, {
            height: "1px",
            background: "rgba(255,255,255,0.10)",
            margin: "2px 0",
        })
        card.appendChild(hr)

        // ── Body ──────────────────────────────────────────────────────────────
        const body = document.createElement("div")
        Object.assign(body.style, {
            fontSize: "13px",
            lineHeight: "1.7",
            color: "rgba(255,255,255,0.75)",
        })
        body.textContent =
            "This site is an interactive visualization of how a guitar produces sound. " +
            "Select a mode to see the strings animate in real time alongside frequency " +
            "spectrum analysis and per-string waveforms. A built-in note editor lets " +
            "you compose your own piece and hear it played back on the guitar."
        card.appendChild(body)

        const story = document.createElement("div")
        Object.assign(story.style, {
            fontSize: "13px",
            lineHeight: "1.7",
            color: "rgba(255,255,255,0.55)",
        })
        story.textContent =
            "Built with D3.js, the Web Audio API, Tone.js, and HTML Canvas. " +
            "Audio uses FreePats guitar samples. The included piece is " +
            "\u201cThe Last of Us \u2013 Main Theme\u201d by Gustavo Santaolalla."
        card.appendChild(story)

        // ── Link buttons ──────────────────────────────────────────────────────
        const links = document.createElement("div")
        Object.assign(links.style, {
            display: "flex",
            gap: "10px",
            flexWrap: "wrap",
            marginTop: "4px",
        })

        const makeLink = (label: string, href: string): HTMLAnchorElement => {
            const a = document.createElement("a")
            a.href = href
            a.target = "_blank"
            a.rel = "noopener noreferrer"
            a.textContent = label
            Object.assign(a.style, {
                display: "inline-block",
                padding: "6px 12px",
                fontSize: "12px",
                fontFamily: "'Inconsolata', monospace",
                letterSpacing: "0.08em",
                color: "white",
                textDecoration: "none",
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.20)",
                borderRadius: "4px",
                cursor: "pointer",
                transition: "background 0.15s",
            })
            a.addEventListener("mouseenter", () => {
                a.style.background = "rgba(255,255,255,0.14)"
            })
            a.addEventListener("mouseleave", () => {
                a.style.background = "rgba(255,255,255,0.06)"
            })
            return a
        }

        links.appendChild(
            makeLink(
                "PROCESS BOOK \u2197",
                "https://github.com/We-Gold/visualize-guitar/blob/main/documents/process_book.pdf",
            ),
        )
        links.appendChild(
            makeLink(
                "PROJECT VIDEO \u2197",
                "https://www.youtube.com/watch?v=YPDqCRBkffA",
            ),
        )
        card.appendChild(links)

        return card
    }

    // ── Public API ────────────────────────────────────────────────────────────

    show(): void {
        this.visible = true
        this.backdrop.style.display = "block"
        this.card.style.display = "flex"
        this.btn.style.background = "rgba(255,255,255,0.12)"
        this.btn.style.borderColor = "rgba(255,255,255,0.35)"
    }

    hide(): void {
        this.visible = false
        this.backdrop.style.display = "none"
        this.card.style.display = "none"
        this.btn.style.background = "rgba(255,255,255,0.06)"
        this.btn.style.borderColor = "rgba(255,255,255,0.20)"
    }

    toggle(): void {
        this.visible ? this.hide() : this.show()
    }
}

