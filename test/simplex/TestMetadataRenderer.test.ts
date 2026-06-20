import hre from 'hardhat'
import { describe, it, expect } from 'vitest'

const connection = await hre.network.connect()

async function fixture() {
  const renderer = await connection.viem.deployContract('MetadataRenderer', [
    '.testing',
  ])
  return { renderer }
}

const loadFixture = async () => connection.networkHelpers.loadFixture(fixture)

function decode(uri: string) {
  expect(uri.startsWith('data:application/json;base64,')).toBe(true)
  return JSON.parse(Buffer.from(uri.split(',')[1], 'base64').toString())
}

function decodeImageSvg(json: any) {
  const prefix = 'data:image/svg+xml;base64,'
  expect(json.image.startsWith(prefix)).toBe(true)
  return Buffer.from(json.image.slice(prefix.length), 'base64').toString()
}

describe('MetadataRenderer', () => {
  it('renders the domain name into a self-contained JSON + SVG data URI', async () => {
    const { renderer } = await loadFixture()
    const json = decode(await renderer.read.tokenURI([0n, 'alice']))
    expect(json.name).toBe('alice.testing')
    expect(json.description).toBe(
      'Your SimpleX name for contact address and public channel',
    )
    const svg = decodeImageSvg(json)
    expect(svg.includes('<svg')).toBe(true)
    expect(svg.includes('alice.testing')).toBe(true)
  })

  it('JSON-escapes quotes and backslashes in the label', async () => {
    const { renderer } = await loadFixture()
    // If escaping were missing, JSON.parse would throw on the raw quote.
    const json = decode(await renderer.read.tokenURI([0n, 'a"b\\c']))
    expect(json.name).toBe('a"b\\c.testing')
  })

  it('XML-escapes markup so the SVG stays well-formed', async () => {
    const { renderer } = await loadFixture()
    const json = decode(await renderer.read.tokenURI([0n, '<x&y>']))
    const svg = decodeImageSvg(json)
    expect(svg.includes('&lt;x&amp;y&gt;.testing')).toBe(true)
    // the raw, unescaped form must not appear in the text node
    expect(svg.includes('>>>')).toBe(false)
  })

  it('includes the background, logo, and name gradients + brand mark', async () => {
    const { renderer } = await loadFixture()
    const svg = decodeImageSvg(decode(await renderer.read.tokenURI([0n, 'alice'])))
    expect(svg).toContain('<linearGradient id="g"') // background
    expect(svg).toContain('<linearGradient id="lg"') // logo P2
    expect(svg).toContain('<linearGradient id="tg"') // name
    expect(svg).toContain('fill="url(#tg)"') // name uses the gradient
    expect(svg).toContain('stop-color="#131D49"') // background mid stop
    expect(svg).toContain('stop-color="#FFF6E0"') // background warm-white stop
    expect(svg).toContain('stop-color="#33CCFF"') // name gradient start (brightened)
    expect(svg).toContain('stop-color="#01F1FF"') // logo brand gradient stop
    expect(svg).toContain('translate(36,36) scale(1.95)') // logo placement
  })

  it('keeps a short label (<=8 chars) on a single line', async () => {
    const { renderer } = await loadFixture()
    const svg = decodeImageSvg(decode(await renderer.read.tokenURI([0n, 'ffobar'])))
    const open = 'text-anchor="middle">'
    const region = svg.slice(
      svg.indexOf(open) + open.length,
      svg.indexOf('</text>'),
    )
    const inners = [
      ...region.matchAll(/<tspan\b[^>]*>([\s\S]*?)<\/tspan>/g),
    ].map((m) => m[1])
    expect(inners.length).toBe(1)
    expect(inners[0]).toBe('ffobar.testing')
  })

  it('wraps a longer label, breaking before the dot (suffix on its own line)', async () => {
    const { renderer } = await loadFixture()
    const svg = decodeImageSvg(
      decode(await renderer.read.tokenURI([0n, 'satoshinakamoto'])),
    )
    const open = 'text-anchor="middle">'
    const region = svg.slice(
      svg.indexOf(open) + open.length,
      svg.indexOf('</text>'),
    )
    const inners = [
      ...region.matchAll(/<tspan\b[^>]*>([\s\S]*?)<\/tspan>/g),
    ].map((m) => m[1])
    // label on its own line(s), the suffix (".testing") on the final line
    expect(inners.length).toBeGreaterThan(1)
    expect(inners[inners.length - 1]).toBe('.testing')
    expect(inners.join('')).toBe('satoshinakamoto.testing') // full name preserved
  })

  it('wraps the longest label and shows the full name (suffix last)', async () => {
    const { renderer } = await loadFixture()
    const label = 'm'.repeat(63) // 63-char label -> 4 label lines + ".testing"
    const svg = decodeImageSvg(decode(await renderer.read.tokenURI([0n, label])))
    const open = 'text-anchor="middle">'
    const region = svg.slice(
      svg.indexOf(open) + open.length,
      svg.indexOf('</text>'),
    )
    const inners = [
      ...region.matchAll(/<tspan\b[^>]*>([\s\S]*?)<\/tspan>/g),
    ].map((m) => m[1])
    expect(inners.length).toBe(5)
    expect(inners[inners.length - 1]).toBe('.testing')
    expect(inners.join('')).toBe(label + '.testing') // full name preserved
  })
})
