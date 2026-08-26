#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

/**
 * GitHub.com contribution calendar (light theme).
 * Empty cells use #ebedf0 so the grid stays visible on a white README —
 * a white fill + hairline border disappears after the snake eats a square.
 *
 * CSS variable replacements must stop at ";" or "}". Platane minifies :root
 * without a trailing semicolon, so `--c4:[^;]+;` used to swallow `.c{...}`
 * and the cells rendered at 0×0 (snake still visible because it has width/height).
 */
export const theme = {
  snake: "#0e4429",
  border: "#d0d7de",
  empty: "#ebedf0",
  dots: ["#ebedf0", "#aceebb", "#4ac26b", "#2da44e", "#116329"],
  strokeWidth: "1px",
  cellRadius: "2",
  cellSize: "12",
}

const fireworkColors = ["#ffd700", "#ff5db1", "#5db4ff", "#ffffff", "#8dff9e"]

function setCssVar(svg, name, value) {
  return svg.replace(new RegExp(`--${name}:[^;}]+`), `--${name}:${value}`)
}

function sizeContributionCells(svg) {
  return svg.replace(/<rect class="c([^"]*)"([^>]*?)\s*\/?>/g, (_, cls, rest) => {
    const cleaned = rest
      .replace(/\s+width="[^"]*"/g, "")
      .replace(/\s+height="[^"]*"/g, "")
      .replace(/\s+rx="[^"]*"/g, "")
      .replace(/\s+ry="[^"]*"/g, "")
      .trimEnd()
    return `<rect class="c${cls}"${cleaned} width="${theme.cellSize}" height="${theme.cellSize}" rx="${theme.cellRadius}" ry="${theme.cellRadius}"/>`
  })
}

export function styleSnake(svg, env = process.env) {
  svg = setCssVar(svg, "cs", theme.snake)
  svg = setCssVar(svg, "cb", theme.border)
  svg = setCssVar(svg, "ce", theme.empty)
  svg = setCssVar(svg, "c0", theme.dots[0])
  svg = setCssVar(svg, "c1", theme.dots[1])
  svg = setCssVar(svg, "c2", theme.dots[2])
  svg = setCssVar(svg, "c3", theme.dots[3])
  svg = setCssVar(svg, "c4", theme.dots[4])

  // Repair a previously swallowed `.c` rule that got concatenated onto :root.
  svg = svg.replace(
    /(:root\{[^}]*--c4:#[0-9a-fA-F]+)(?:;fill:var\(--ce\);stroke-width:[^}]+)?\}/,
    "$1}",
  )

  svg = sizeContributionCells(svg)

  const durationMatch = svg.match(/animation:\s*none\s+(\d+)ms/)
  const nativeDuration = durationMatch ? Number(durationMatch[1]) : 41500
  const override = Number(env.STYLE_SNAKE_DURATION)
  const duration = Number.isFinite(override) && override > 0 ? override : nativeDuration

  if (duration !== nativeDuration) {
    svg = svg.replace(/animation:\s*none\s+\d+ms/, `animation:none ${duration}ms`)
  }

  const cellRule = `.c{shape-rendering:geometricPrecision;fill:${theme.empty};stroke:${theme.border};stroke-width:${theme.strokeWidth};animation:none ${duration}ms linear infinite;width:${theme.cellSize}px;height:${theme.cellSize}px;rx:${theme.cellRadius}px;ry:${theme.cellRadius}px}`
  svg = svg.replace(
    /\.c\{shape-rendering:geometricPrecision;fill:[^}]+\}/g,
    "",
  )
  svg = svg.replace("</style>", `${cellRule}</style>`)

  const percentMatches = [...svg.matchAll(/([\d.]+)%\{fill:var\(--c[0-4]\)\}/g)]
  const lastEaten = percentMatches.reduce((max, m) => Math.max(max, Number(m[1])), 0)

  const viewBox = (svg.match(/viewBox="([^"]+)"/)?.[1] ?? "-16 -32 880 192")
    .split(/\s+/)
    .map(Number)
  const [vbX, vbY, vbW, vbH] = viewBox
  const gridRight = vbX + vbW - 40
  const gridBottom = vbY + vbH - 40

  const centers = [
    [vbX + vbW * 0.2, vbY + vbH * 0.35],
    [vbX + vbW * 0.45, vbY + vbH * 0.22],
    [vbX + vbW * 0.68, vbY + vbH * 0.4],
    [vbX + vbW * 0.85, vbY + vbH * 0.28],
  ].map(([x, y]) => [
    Math.min(Math.max(x, vbX + 30), gridRight),
    Math.min(Math.max(y, vbY + 20), gridBottom),
  ])

  const windowStart = Math.min(lastEaten + 0.4, 99)
  const windowSpan = Math.max(100 - windowStart, 3)
  const particlesPerBurst = 12
  const spreadRadius = 11

  let styles = ""
  let groups = ""

  centers.forEach(([cx, cy], i) => {
    const start = +(windowStart + (windowSpan * i) / (centers.length + 1)).toFixed(2)
    const flash = +(start + 0.3).toFixed(2)
    const end = +Math.min(start + windowSpan * 0.75, 99.9).toFixed(2)

    styles += `
.fw${i}{opacity:0;animation:fw${i} ${duration}ms linear infinite}
@keyframes fw${i}{
  0%,${start}%{opacity:0;transform:translate(${cx.toFixed(1)}px,${cy.toFixed(1)}px) scale(0.12)}
  ${flash}%{opacity:1;transform:translate(${cx.toFixed(1)}px,${cy.toFixed(1)}px) scale(0.2)}
  ${end}%{opacity:0;transform:translate(${cx.toFixed(1)}px,${cy.toFixed(1)}px) scale(2.1)}
  100%{opacity:0}
}`

    let particles = ""
    for (let p = 0; p < particlesPerBurst; p++) {
      const angle = (p / particlesPerBurst) * Math.PI * 2
      const px = (Math.cos(angle) * spreadRadius).toFixed(2)
      const py = (Math.sin(angle) * spreadRadius).toFixed(2)
      const color = fireworkColors[p % fireworkColors.length]
      particles += `<circle cx="${px}" cy="${py}" r="2.2" fill="${color}"/>`
    }
    groups += `<g class="fw${i}">${particles}</g>`
  })

  const fireworksLayer = `<style>${styles}</style>${groups}`

  // Idempotent: drop a previously injected fireworks layer before re-adding.
  svg = svg.replace(/<style>\s*\.fw0[\s\S]*<\/svg>\s*$/, "</svg>")

  if (svg.includes("</svg>")) {
    svg = svg.replace(/<\/svg>\s*$/, `${fireworksLayer}</svg>`)
  } else {
    svg = `${svg}${fireworksLayer}`
  }

  return svg
}

function resolveInput(input) {
  if (existsSync(input)) return input

  const candidates = []
  const dirs = [dirname(input) || ".", "dist", ".", "public"]
  for (const dir of dirs) {
    try {
      for (const f of readdirSync(dir)) {
        if (f.endsWith(".svg")) candidates.push(`${dir}/${f}`)
      }
    } catch {
      /* ignore missing dirs */
    }
  }
  console.log("cwd:", process.cwd())
  console.log("input not found:", input)
  console.log("svg candidates:", candidates)
  if (candidates.length === 0) {
    console.error("No SVG found to style. Did the snk step run before this one?")
    process.exit(1)
  }
  console.log("using:", candidates[0])
  return candidates[0]
}

function main() {
  let input = process.argv[2]
  let output = process.argv[3] ?? input

  if (!input) {
    console.error("usage: node scripts/style-snake.mjs <input.svg> [output.svg]")
    process.exit(1)
  }

  input = resolveInput(input)
  if (!process.argv[3] && input !== process.argv[2]) output = input

  const svg = readFileSync(input, "utf8")
  writeFileSync(output, styleSnake(svg))
  console.log(`styled snake -> ${output}`)
}

const invokedDirectly =
  Boolean(process.argv[1]) && fileURLToPath(import.meta.url) === resolve(process.argv[1])
if (invokedDirectly) main()
