import hre from 'hardhat'
import { describe, it, expect } from 'vitest'

// Seeded property/fuzz test for MetadataRenderer. The contract parses an
// attacker-controlled label into JSON + SVG, so the invariants are:
//   1. the output is always a valid JSON data URI (no JSON injection),
//   2. the object has exactly the expected keys (no injected keys),
//   3. the decoded `name` round-trips the label (control bytes -> space),
//   4. no <tspan> line content contains a raw '<' or '>' (no XML break-out),
//   5. the wrapped lines reassemble to the full name (nothing lost on wrap).

const connection = await hre.network.connect()

async function fixture() {
  const renderer = await connection.viem.deployContract('MetadataRenderer', [
    '.testing',
  ])
  return { renderer }
}
const loadFixture = async () => connection.networkHelpers.loadFixture(fixture)

// deterministic PRNG so failures are reproducible
function mulberry32(seed: number) {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// alphabet weighted toward the dangerous characters the escapers must handle
const ALPHABET = [
  ...'abcdefghijklmnopqrstuvwxyz0123456789-_. ',
  '"',
  '\\',
  '<',
  '>',
  '&',
  "'",
  '\x00',
  '\x09',
  '\x1f',
  'é',
  '中',
  '😀',
]

function randomLabel(rnd: () => number): string {
  const len = 1 + Math.floor(rnd() * 62) // up to 63 — exercises 1..3 lines
  let s = ''
  for (let i = 0; i < len; i++) s += ALPHABET[Math.floor(rnd() * ALPHABET.length)]
  return s
}

const xmlUnescape = (s: string) =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&') // must be last

const decodeJson = (uri: string) => {
  expect(uri.startsWith('data:application/json;base64,')).toBe(true)
  return JSON.parse(Buffer.from(uri.split(',')[1], 'base64').toString())
}
const decodeSvg = (image: string) => {
  const prefix = 'data:image/svg+xml;base64,'
  expect(image.startsWith(prefix)).toBe(true)
  return Buffer.from(image.slice(prefix.length), 'base64').toString()
}
// mirror of the contract's control-byte sanitisation for the JSON name field
const sanitizeControls = (s: string) =>
  Array.from(s)
    .map((ch) => (ch.codePointAt(0)! < 0x20 ? ' ' : ch))
    .join('')

describe('MetadataRenderer (fuzz)', () => {
  it('never breaks JSON or escapes out of the SVG text node', async () => {
    const { renderer } = await loadFixture()
    const rnd = mulberry32(0xc0ffee)
    // labels are generated in order (deterministic); the reads are pure views,
    // so fire them concurrently to stay well under the test timeout.
    const labels = Array.from({ length: 200 }, () => randomLabel(rnd))
    const uris = await Promise.all(
      labels.map((label) => renderer.read.tokenURI([0n, label])),
    )

    for (let i = 0; i < labels.length; i++) {
      const label = labels[i]
      const json = decodeJson(uris[i]) // (1) parses
      expect(Object.keys(json).sort()).toEqual([
        'description',
        'image',
        'name',
      ]) // (2) no injected keys
      expect(json.name).toBe(sanitizeControls(label) + '.testing') // (3) round-trip

      const svg = decodeSvg(json.image)
      const open = 'text-anchor="middle">'
      const region = svg.slice(
        svg.indexOf(open) + open.length,
        svg.indexOf('</text>'),
      )
      const inners = [...region.matchAll(/<tspan\b[^>]*>([\s\S]*?)<\/tspan>/g)].map(
        (m) => m[1],
      )
      expect(inners.length).toBeGreaterThan(0)
      // (4) the label can never inject markup into a line's text content
      for (const inner of inners) {
        expect(inner.includes('<')).toBe(false)
        expect(inner.includes('>')).toBe(false)
      }
      // (5) the wrapped lines reassemble (un-escaped) to the full name
      expect(xmlUnescape(inners.join(''))).toBe(label + '.testing')
    }
  }, 30000)
})
