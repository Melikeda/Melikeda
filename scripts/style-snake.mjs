#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs"
import { dirname } from "node:path"

let input = process.argv[2]
let output = process.argv[3] ?? input

if (!input) {
  console.error("usage: node scripts/style-snake.mjs <input.svg> [output.svg]")
  process.exit(1)
}

if (!existsSync(input)) {
  const candidates = []
  const dirs = [dirname(input) || ".", "dist", "."]
  for (const dir of dirs) {
    try {
      for (const f of readdirSync(dir)) {
        if (f.endsWith(".svg")) candidates.push(`${dir}/${f}`)
      }
    } catch {}
  }
  console.log("cwd:", process.cwd())
  console.log("input not found:", input)
  console.log("svg candidates:", candidates)
  if (candidates.length === 0) {
    console.error("No SVG found to style. Did the snk step run before this one?")
    process.exit(1)
  }
  input = candidates[0]
  if (!process.argv[3]) output = input
  console.log("using:", input)
}

const theme = {
  snake: "#0a2f6b",
  border: "#cfe2ff",
  empty: "#eaf3ff",
  dots: ["#dbeeff", "#a8d3ff", "#66b2ff", "#2a8cff", "#0a63d6"],
}

const fireworkColors = ["#ffd700", "#ff5db1", "#5db4ff", "#ffffff", "#8dff9e"]

let svg = readFileSync(input, "utf8")

const replacements = [
  [/--cs:[^;]+;/, `--cs:${theme.snake};`],
  [/--cb:[^;]+;/, `--cb:${theme.border};`],
  [/--ce:[^;]+;/, `--ce:${theme.empty};`],
  [/--c0:[^;]+;/, `--c0:${theme.dots[0]};`],
  [/--c1:[^;]+;/, `--c1:${theme.dots[1]};`],
  [/--c2:[^;]+;/, `--c2:${theme.dots[2]};`],
  [/--c3:[^;]+;/, `--c3:${theme.dots[3]};`],
  [/--c4:[^;]+;/, `--c4:${theme.dots[4]};`],
]
for (const [re, value] of replacements) {
  svg = svg.replace(re, value)
}

const durationMatch = svg.match(/animation:\s*none\s+(\d+)ms/)
const nativeDuration = durationMatch ? Number(durationMatch[1]) : 41500
const override = Number(process.env.STYLE_SNAKE_DURATION)
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

if (svg.includes("</svg>")) {
  svg = svg.replace(/<\/svg>\s*$/, `${fireworksLayer}</svg>`)
} else {
  svg = `${svg}${fireworksLayer}`
}

writeFileSync(output, svg)
console.log(`styled snake -> ${output}`)
