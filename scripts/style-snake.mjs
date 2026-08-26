#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

/**
 * Match GitHub.com's contribution calendar (light theme):
 * white empty cells, 1px muted border, 2px corner radius, green levels.
 * Empty cells keep a visible outline so the grid does not vanish on the
 * white README after the snake eats a square.
 */
export const theme = {
  snake: "#0e4429",
  border: "#d0d7de",
  empty: "#ffffff",
  dots: ["#ffffff", "#aceebb", "#4ac26b", "#2da44e", "#116329"],
  strokeWidth: "1px",
  cellRadius: "2",
}

const fireworkColors = ["#ffd700", "#ff5db1", "#5db4ff", "#ffffff", "#8dff9e"]

function roundContributionCells(svg) {
  return svg.replace(
    /(<rect class="c[^"]*"[^>]*?)\s+rx="[\d.]+"\s+ry="[\d.]+"/g,
    `$1 rx="${theme.cellRadius}" ry="${theme.cellRadius}"`,
  )
}

export function styleSnake(svg, env = process.env) {
  const replacements = [
    [/--cs:[^;]+;/, `--cs:${theme.snake};`],
    [/--cb:[^;]+;/, `--cb:${theme.border};`],
    [/--ce:[^;]+;/, `--ce:${theme.empty};`],
    [/--c0:[^;]+;/, `--c0:${theme.dots[0]};`],
    [/--c1:[^;]+;/, `--c1:${theme.dots[1]};`],
    [/--c2:[^;]+;/, `--c2:${theme.dots[2]};`],
    [/--c3:[^;]+;/, `--c3:${theme.dots[3]};`],
    [/--c4:[^;]+;/, `--c4:${theme.dots[4]};`],
    [/stroke-width:\s*[\d.]+px/, `stroke-width:${theme.strokeWidth}`],
  ]
  for (const [re, value] of replacements) {
    svg = svg.replace(re, value)
  }

  svg = roundContributionCells(svg)

  // Explicit colors (not only CSS variables) so empty cells stay visible
  // if GitHub's image proxy strips :root custom properties.
  const cellRule = `.c{fill:${theme.empty};stroke:${theme.border};stroke-width:${theme.strokeWidth};rx:${theme.cellRadius}px;ry:${theme.cellRadius}px}`
  svg = svg.replace(/\.c\{fill:(?:var\(--ce\)|#[0-9a-fA-F]{3,8});stroke:[^}]+\}/g, "")
  svg = svg.replace("</style>", `${cellRule}</style>`)

  const durationMatch = svg.match(/animation:\s*none\s+(\d+)ms/)
  const nativeDuration = durationMatch ? Number(durationMatch[1]) : 41500
  const override = Number(env.STYLE_SNAKE_DURATION)
  const duration = Number.isFinite(override) && override > 0 ? override : nativeDuration

  if (duration !== nativeDuration) {
    svg = svg.replace(/animation:\s*none\s+\d+ms/, `animation:none ${duration}ms`)
  }

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
