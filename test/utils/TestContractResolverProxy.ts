import * as packet from 'dns-packet'
import { Contract } from 'ethers'
import { namehash, solidityKeccak256 } from 'ethers/lib/utils'
import { contract, ethers, expect } from 'hardhat'

const ROOT_NODE =
  '0x0000000000000000000000000000000000000000000000000000000000000000'

const hexEncodeName = (name: string) =>
  '0x' + packet.name.encode(name).toString('hex')

const labelhash = (label: string) => solidityKeccak256(['string'], [label])

contract('ContractResolverProxy', (accounts) => {
  let ensRegistry: Contract
  let universalResolver: Contract
  let contractResolverProxy: Contract
  let ownedResolver: Contract

  beforeEach(async () => {
    const ENSRegistry = await ethers.getContractFactory('ENSRegistry')
    const UniversalResolver = await ethers.getContractFactory(
      'UniversalResolverNoMulticall',
    )
    const ContractResolverProxy = await ethers.getContractFactory(
      'ContractResolverProxy',
    )
    const OwnedResolver = await ethers.getContractFactory('OwnedResolver')

    ensRegistry = await ENSRegistry.deploy()
    await ensRegistry.deployed()

    universalResolver = await UniversalResolver.deploy(ensRegistry.address)
    await universalResolver.deployed()

    contractResolverProxy = await ContractResolverProxy.deploy(
      universalResolver.address,
    )
    await contractResolverProxy.deployed()

    ownedResolver = await OwnedResolver.deploy()
    await ownedResolver.deployed()

    await ensRegistry.setSubnodeOwner(
      ROOT_NODE,
      labelhash('eth'),
      accounts[0],
      {
        from: accounts[0],
      },
    )

    await ensRegistry.setSubnodeOwner(
      namehash('eth'),
      labelhash('ens'),
      accounts[0],
      { from: accounts[0] },
    )

    await ensRegistry.setSubnodeRecord(
      namehash('ens.eth'),
      labelhash('registry'),
      accounts[0],
      ownedResolver.address,
      0,
      { from: accounts[0] },
    )

    await ownedResolver['setAddr(bytes32,address)'](
      namehash('registry.ens.eth'),
      ensRegistry.address,
      {
        from: accounts[0],
      },
    )
  })

  it('works', async () => {
    const data = ensRegistry.interface.encodeFunctionData('owner', [
      namehash('registry.ens.eth'),
    ])
    const result = await contractResolverProxy.resolve(
      hexEncodeName('registry.ens.eth'),
      data,
    )

    const [returnAddress] = ensRegistry.interface.decodeFunctionResult(
      'owner',
      result,
    )
    expect(returnAddress).to.equal(accounts[0])
  })
})
