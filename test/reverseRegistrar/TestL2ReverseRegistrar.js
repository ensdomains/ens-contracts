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

  // Add more tests here
})
