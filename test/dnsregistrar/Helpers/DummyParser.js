const { expect } = require('chai')
const { ethers } = require('hardhat')
const { toUtf8Bytes } = require('ethers/lib/utils')

describe('DummyParser', () => {
  let parser

  before(async () => {
    const factory = await ethers.getContractFactory('DummyParser')
    parser = await factory.deploy()
  })

  it('parse data', async () => {
    const data = 'usdt;issuer=tether decimals=18;https://tether.to'
    const [name, keys, values, url] = await parser.parseData(
      toUtf8Bytes(data),
      2,
    )
    // correct name
    expect(name).to.eq('usdt')
    // correct keys and values
    expect(keys[0]).to.eq('issuer')
    expect(values[0]).to.eq('tether')
    expect(keys[1]).to.eq('decimals')
    // incorrect last value
    expect(values[1]).not.to.eq('18;https://tether.to')
    // correct url
    expect(url).to.eq('https://tether.to')
  })
})
