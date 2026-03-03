const SVG_NS = "http://www.w3.org/2000/svg"

function makeSvgEl<K extends keyof SVGElementTagNameMap>(
    tag: K,
    attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
    const el = document.createElementNS(SVG_NS, tag)
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v))
    return el
}

/**
 * A toggle button that switches between play mode and edit mode.
 * Renders a pencil + music-note icon; injects itself to the left of the
 * selector SVG container inside #selector-container.
 */
export class EditModeToggle {
    private btn: HTMLDivElement
    private isEditMode = false
    private toggleCb: ((editing: boolean) => void) | null = null

    constructor(selectorContainer: HTMLElement) {
        this.btn = document.createElement("div")
        this.btn.id = "edit-mode-toggle"
        this.btn.title = "Toggle edit mode"

        Object.assign(this.btn.style, {
            position: "absolute",
            top: "50%",
            right: "calc(100% + 14px)",
            transform: "translateY(-50%)",
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

        const icon = this.buildIcon()
        this.btn.appendChild(icon)

        this.btn.addEventListener("mouseenter", () => {
            if (!this.isEditMode) {
                this.btn.style.background = "rgba(255,255,255,0.12)"
            }
        })
        this.btn.addEventListener("mouseleave", () => {
            if (!this.isEditMode) {
                this.btn.style.background = "rgba(255,255,255,0.06)"
            }
        })
        this.btn.addEventListener("click", () => this.toggle())

        // Make #selector-container a positioning context so we can place
        // the button relative to it.
        selectorContainer.style.position = "absolute"
        selectorContainer.appendChild(this.btn)
    }

    // ── Icon: pencil + music note ─────────────────────────────────────────────

    private buildIcon(): SVGSVGElement {
        const W = 20
        const H = 20
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

        // ── Pencil (left side, slightly rotated) ──────────────────────────────
        // Body: a thin parallelogram from top-right to bottom-left
        // Tip at bottom-left, eraser stub at top-right
        const pencil = makeSvgEl("g", { transform: "rotate(-38, 10, 10)" })

        // Body
        pencil.appendChild(
            makeSvgEl("rect", {
                x: 8,
                y: 2,
                width: 4,
                height: 13,
                rx: 1,
                fill: "none",
            }),
        )

        // Tip (triangle)
        pencil.appendChild(
            makeSvgEl("polygon", {
                points: "8,15 12,15 10,19",
                fill: "rgba(255,255,255,0.25)",
                stroke: "rgba(255,255,255,0.60)",
                "stroke-width": "1.1",
            }),
        )

        // Eraser cap
        pencil.appendChild(
            makeSvgEl("rect", {
                x: 8,
                y: 1,
                width: 4,
                height: 2.5,
                rx: 0.8,
                fill: "rgba(254,134,1,0.55)",
                stroke: "rgba(254,134,1,0.80)",
                "stroke-width": "0.9",
            }),
        )

        g.appendChild(pencil)

        // ── Music note (top-right corner, small) ──────────────────────────────
        const note = makeSvgEl("g", {
            fill: "rgba(255,255,255,0.55)",
            stroke: "none",
        })

        // Note head (filled oval)
        const noteHead = makeSvgEl("ellipse", {
            cx: 15.5,
            cy: 14.5,
            rx: 2.1,
            ry: 1.6,
            transform: "rotate(-15, 15.5, 14.5)",
        })
        note.appendChild(noteHead)

        // Stem
        const stem = makeSvgEl("line", {
            x1: 17.5,
            y1: 14,
            x2: 17.5,
            y2: 7.5,
            stroke: "rgba(255,255,255,0.55)",
            "stroke-width": "1.2",
            "stroke-linecap": "round",
        })
        note.appendChild(stem)

        // Flag
        const flag = makeSvgEl("path", {
            d: "M17.5,7.5 C20.5,8.5 20.5,10.5 17.5,11.5",
            stroke: "rgba(255,255,255,0.55)",
            "stroke-width": "1.2",
            fill: "none",
            "stroke-linecap": "round",
        })
        note.appendChild(flag)

        g.appendChild(note)
        svg.appendChild(g)
        return svg
    }

    // ── Public API ────────────────────────────────────────────────────────────

    onToggle(cb: (editing: boolean) => void): void {
        this.toggleCb = cb
    }

    setEditMode(active: boolean): void {
        this.isEditMode = active
        if (active) {
            this.btn.style.background = "rgba(254,134,1,0.30)"
            this.btn.style.borderColor = "rgba(254,134,1,0.80)"
            this.btn.title = "Exit edit mode"
        } else {
            this.btn.style.background = "rgba(255,255,255,0.06)"
            this.btn.style.borderColor = "rgba(255,255,255,0.20)"
            this.btn.title = "Enter edit mode"
        }
    }

    private toggle(): void {
        this.isEditMode = !this.isEditMode
        this.setEditMode(this.isEditMode)
        this.toggleCb?.(this.isEditMode)
    }
}

