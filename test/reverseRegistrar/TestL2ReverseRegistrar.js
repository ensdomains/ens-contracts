const { expect } = require('chai')
const { ethers } = require('hardhat')
const { labelhash, namehash } = require('../test-utils/ens')

describe('L2ReverseRegistrar', function () {
  let l2ReverseRegistrar

  beforeEach(async function () {
    const L2ReverseRegistrar = await ethers.getContractFactory(
      'L2ReverseRegistrar',
    )
    l2ReverseRegistrar = await L2ReverseRegistrar.deploy(
      namehash('optimsim.reverse'),
    )
    await l2ReverseRegistrar.deployed()
  })

  it('should deploy the contract', async function () {
    expect(l2ReverseRegistrar.address).to.not.equal(0)
  })

  //write all my tests for me
  it('should set the name record for the calling account', async function () {
    const name = 'myname.eth'
    const tx = await l2ReverseRegistrar.setName(name)
    await tx.wait()

    const node = await l2ReverseRegistrar.node(
      await ethers.provider.getSigner().getAddress(),
    )
    const actualName = await l2ReverseRegistrar.name(node)

    expect(actualName).to.equal(name)
  })
})
