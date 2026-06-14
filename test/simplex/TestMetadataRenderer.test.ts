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
    expect(typeof json.description).toBe('string')
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
})
