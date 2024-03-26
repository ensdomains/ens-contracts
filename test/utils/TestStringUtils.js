const { expect } = require('chai')
const { ethers } = require('hardhat')

describe('StringUtils', () => {
  let stringUtils

  before(async () => {
    const StringUtils = await ethers.getContractFactory('StringUtilsTest')
    stringUtils = await StringUtils.deploy()
    await stringUtils.deployed()
  })

  it('should escape double quote correctly based JSON standard', async () => {
    expect(await stringUtils.testEscape('My ENS is, "tanrikulu.eth"')).to.equal(
      'My ENS is, \\"tanrikulu.eth\\"',
    )
  })

  it('should escape backslash correctly based JSON standard', async () => {
    expect(await stringUtils.testEscape('Path\\to\\file')).to.equal(
      'Path\\\\to\\\\file',
    )
  })

  it('should escape new line character correctly based JSON standard', async () => {
    expect(await stringUtils.testEscape('Line 1\nLine 2')).to.equal(
      'Line 1\\nLine 2',
    )
  })
})
