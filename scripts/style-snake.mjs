#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

/**
 * GitHub.com contribution calendar layout (visible empty cells + sized rects)
 * with a navy snake and blue contribution levels.
 *
 * CSS variable replacements must stop at ";" or "}". Platane minifies :root
 * without a trailing semicolon, so `--c4:[^;]+;` used to swallow `.c{...}`
 * and the cells rendered at 0×0.
 */
export const theme = {
  snake: "#0a2548",
  border: "#d0d7de",
  empty: "#ebedf0",
  dots: ["#ebedf0", "#b7d7f5", "#6aa8e8", "#2b7fd6", "#0a4a94"],
  strokeWidth: "1px",
  cellRadius: "2",
  cellSize: "12",
}

const FINALE_HOLD_MS = 3000

const fireworkColors = [
  "#ffffff",
  "#fff4b0",
  "#ffd700",
  "#7ec8ff",
  "#ff8ad4",
  "#c8f4ff",
  "#ffe566",
]

const triangleColors = [
  "#7a4a00",
  "#0a2548",
  "#8a1858",
  "#0a4a94",
  "#5a1a7a",
  "#0d3d6e",
  "#6b2e00",
]

function fireworkTriangle(cx, cy, size, color, rotation) {
  const half = size * 0.52
  const rad = (rotation * Math.PI) / 180
  const points = [
    [0, -size],
    [half, size * 0.55],
    [-half, size * 0.55],
  ].map(([x, y]) => {
    const xr = x * Math.cos(rad) - y * Math.sin(rad)
    const yr = x * Math.sin(rad) + y * Math.cos(rad)
    return `${(cx + xr).toFixed(2)},${(cy + yr).toFixed(2)}`
  })
  return `<polygon points="${points.join(" ")}" fill="${color}"/>`
}

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

function stretchPlayhead(svg, nativeDuration, duration) {
  const scale = nativeDuration / duration
  const hold = +(100 * scale).toFixed(2)
  return svg.replace(/<style>([\s\S]*?)<\/style>/, (_, css) => {
    const scaled = css.replace(/([\d.]+)%/g, (m, raw) => {
      const v = Number(raw)
      if (v === 0) return "0%"
      const next = +Math.min(v * scale, 99.99).toFixed(2)
      if (v === 100) return `${hold}%,100%`
      return `${next}%`
    })
    return `<style>${scaled}</style>`
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
  const duration =
    Number.isFinite(override) && override > 0 ? override : nativeDuration + FINALE_HOLD_MS

  const percentMatches = [...svg.matchAll(/([\d.]+)%\{fill:var\(--c[0-4]\)\}/g)]
  const lastEaten = percentMatches.reduce((max, m) => Math.max(max, Number(m[1])), 0)

  if (duration !== nativeDuration) {
    svg = stretchPlayhead(svg, nativeDuration, duration)
    svg = svg.replaceAll(`${nativeDuration}ms`, `${duration}ms`)
  }

  const cellRule = `.c{shape-rendering:geometricPrecision;fill:${theme.empty};stroke:${theme.border};stroke-width:${theme.strokeWidth};animation:none ${duration}ms linear infinite;width:${theme.cellSize}px;height:${theme.cellSize}px;rx:${theme.cellRadius}px;ry:${theme.cellRadius}px}`
  svg = svg.replace(
    /\.c\{shape-rendering:geometricPrecision;fill:[^}]+\}/g,
    "",
  )
  svg = svg.replace("</style>", `${cellRule}</style>`)

  const viewBox = (svg.match(/viewBox="([^"]+)"/)?.[1] ?? "-16 -32 880 192")
    .split(/\s+/)
    .map(Number)
  const [vbX, vbY, vbW, vbH] = viewBox
  const gridRight = vbX + vbW - 40
  const gridBottom = vbY + vbH - 40

  const centers = [
    [vbX + vbW * 0.16, vbY + vbH * 0.32],
    [vbX + vbW * 0.38, vbY + vbH * 0.2],
    [vbX + vbW * 0.55, vbY + vbH * 0.42],
    [vbX + vbW * 0.72, vbY + vbH * 0.24],
    [vbX + vbW * 0.88, vbY + vbH * 0.36],
    [vbX + vbW * 0.28, vbY + vbH * 0.52],
  ].map(([x, y]) => [
    Math.min(Math.max(x, vbX + 30), gridRight),
    Math.min(Math.max(y, vbY + 20), gridBottom),
  ])

  const playthrough = (nativeDuration / duration) * 100
  const lastEatenOnTimeline = lastEaten * (nativeDuration / duration)
  const windowStart = Math.min(lastEatenOnTimeline + 0.3, playthrough)
  const windowSpan = Math.max(100 - windowStart, 4)
  const particlesPerBurst = 22
  const sparklesPerBurst = 18
  const spreadRadius = 26
  const sparkleRadius = 40

  let styles = ""
  let groups = ""

  centers.forEach(([cx, cy], i) => {
    const start = +(windowStart + (windowSpan * i) / (centers.length + 1.2)).toFixed(2)
    const flash = +(start + 0.25).toFixed(2)
    const hold = +(start + windowSpan * 0.55).toFixed(2)
    const end = +Math.min(start + windowSpan * 0.95, 99.6).toFixed(2)

    styles += `
.fw${i}{opacity:0;animation:fw${i} ${duration}ms linear infinite}
@keyframes fw${i}{
  0%,${start}%{opacity:0;transform:translate(${cx.toFixed(1)}px,${cy.toFixed(1)}px) scale(0.08)}
  ${flash}%{opacity:1;transform:translate(${cx.toFixed(1)}px,${cy.toFixed(1)}px) scale(0.35)}
  ${hold}%{opacity:1;transform:translate(${cx.toFixed(1)}px,${cy.toFixed(1)}px) scale(2.6)}
  ${end}%{opacity:0;transform:translate(${cx.toFixed(1)}px,${cy.toFixed(1)}px) scale(5.4)}
  100%{opacity:0}
}`

    let particles = `<circle cx="0" cy="0" r="5.2" fill="#fffef0"/><circle cx="0" cy="0" r="9" fill="#ffd700" fill-opacity="0.35"/>`
    for (let p = 0; p < particlesPerBurst; p++) {
      const angle = (p / particlesPerBurst) * Math.PI * 2
      const jitter = 0.72 + (p % 5) * 0.08
      const px = (Math.cos(angle) * spreadRadius * jitter).toFixed(2)
      const py = (Math.sin(angle) * spreadRadius * jitter).toFixed(2)
      const color = fireworkColors[p % fireworkColors.length]
      const r = (2.4 + (p % 4) * 0.7).toFixed(1)
      particles += `<circle cx="${px}" cy="${py}" r="${r}" fill="${color}"/>`
    }
    const trianglesPerBurst = 14
    for (let p = 0; p < trianglesPerBurst; p++) {
      const angle = (p / trianglesPerBurst) * Math.PI * 2 + 0.11
      const radius = spreadRadius * (0.55 + (p % 3) * 0.12)
      const px = Math.cos(angle) * radius
      const py = Math.sin(angle) * radius
      const color = triangleColors[p % triangleColors.length]
      const size = 1.15 + (p % 3) * 0.15
      particles += fireworkTriangle(px, py, size, color, (p * 37) % 360)
    }
    for (let p = 0; p < sparklesPerBurst; p++) {
      const angle = (p / sparklesPerBurst) * Math.PI * 2 + 0.19
      const px = (Math.cos(angle) * sparkleRadius).toFixed(2)
      const py = (Math.sin(angle) * sparkleRadius).toFixed(2)
      const color = fireworkColors[(p + 2) % fireworkColors.length]
      particles += `<circle cx="${px}" cy="${py}" r="1.15" fill="${color}"/>`
      particles += `<rect x="${(+px - 0.45).toFixed(2)}" y="${(+py - 2.1).toFixed(2)}" width="0.9" height="4.2" fill="#ffffff" rx="0.4"/>`
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
