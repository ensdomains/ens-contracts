import { loadFixture } from '@nomicfoundation/hardhat-toolbox-viem/network-helpers.js'
import { expect } from 'chai'
import hre from 'hardhat'
import { labelhash, namehash, zeroAddress, zeroHash } from 'viem'
import { toLabelId } from '../fixtures/utils.js'

const getAccounts = async () => {
  const [ownerClient, controllerClient, registrantClient, otherClient] =
    await hre.viem.getWalletClients()
  return {
    ownerAccount: ownerClient.account,
    ownerClient,
    controllerAccount: controllerClient.account,
    controllerClient,
    registrantAccount: registrantClient.account,
    registrantClient,
    otherAccount: otherClient.account,
    otherClient,
  }
}

async function fixture() {
  const publicClient = await hre.viem.getPublicClient()
  const accounts = await getAccounts()
  const ensRegistry = await hre.viem.deployContract('ENSRegistry', [])
  const baseRegistrar = await hre.viem.deployContract(
    'BaseRegistrarImplementation',
    [ensRegistry.address, namehash('eth')],
  )

  await baseRegistrar.write.addController([accounts.controllerAccount.address])
  await ensRegistry.write.setSubnodeOwner([
    zeroHash,
    labelhash('eth'),
    baseRegistrar.address,
  ])

  return { ensRegistry, baseRegistrar, publicClient, ...accounts }
}

async function fixtureWithRegistration() {
  const existing = await loadFixture(fixture)
  await existing.baseRegistrar.write.register(
    [toLabelId('newname'), existing.registrantAccount.address, 86400n],
    {
      account: existing.controllerAccount,
    },
  )
  return existing
}

describe('BaseRegistrar', () => {
  it('should allow new registrations', async () => {
    const {
      ensRegistry,
      baseRegistrar,
      controllerAccount,
      registrantAccount,
      publicClient,
    } = await loadFixture(fixture)

    const hash = await baseRegistrar.write.register(
      [toLabelId('newname'), registrantAccount.address, 86400n],
      {
        account: controllerAccount,
      },
    )
    const receipt = await publicClient.getTransactionReceipt({ hash })
    const block = await publicClient.getBlock({ blockHash: receipt.blockHash })

    await expect(
      ensRegistry.read.owner([namehash('newname.eth')]),
    ).resolves.toEqualAddress(registrantAccount.address)
    await expect(
      baseRegistrar.read.ownerOf([toLabelId('newname')]),
    ).resolves.toEqualAddress(registrantAccount.address)
    await expect(
      baseRegistrar.read.nameExpires([toLabelId('newname')]),
    ).resolves.toEqual(block.timestamp + 86400n)
  })

  it('should allow registrations without updating the registry', async () => {
    const {
      ensRegistry,
      baseRegistrar,
      controllerAccount,
      registrantAccount,
      publicClient,
    } = await loadFixture(fixture)

    const hash = await baseRegistrar.write.registerOnly(
      [toLabelId('silentname'), registrantAccount.address, 86400n],
      {
        account: controllerAccount,
      },
    )
    const receipt = await publicClient.getTransactionReceipt({ hash })
    const block = await publicClient.getBlock({ blockHash: receipt.blockHash })

    await expect(
      ensRegistry.read.owner([namehash('silentname.eth')]),
    ).resolves.toEqualAddress(zeroAddress)
    await expect(
      baseRegistrar.read.ownerOf([toLabelId('silentname')]),
    ).resolves.toEqualAddress(registrantAccount.address)
    await expect(
      baseRegistrar.read.nameExpires([toLabelId('silentname')]),
    ).resolves.toEqual(block.timestamp + 86400n)
  })

  it('should allow renewals', async () => {
    const { baseRegistrar, controllerAccount } = await loadFixture(
      fixtureWithRegistration,
    )

    const oldExpires = await baseRegistrar.read.nameExpires([
      toLabelId('newname'),
    ])

    await baseRegistrar.write.renew([toLabelId('newname'), 86400n], {
      account: controllerAccount,
    })

    await expect(
      baseRegistrar.read.nameExpires([toLabelId('newname')]),
    ).resolves.toEqual(oldExpires + 86400n)
  })

  it('should only allow the controller to register', async () => {
    const { baseRegistrar, otherAccount } = await loadFixture(fixture)

    await expect(baseRegistrar)
      .write('register', [toLabelId('foo'), otherAccount.address, 86400n], {
        account: otherAccount,
      })
      .toBeRevertedWithoutReason()
  })

  it('should only allow the controller to renew', async () => {
    const { baseRegistrar, otherAccount } = await loadFixture(fixture)

    await expect(baseRegistrar)
      .write('renew', [toLabelId('foo'), 86400n], {
        account: otherAccount,
      })
      .toBeRevertedWithoutReason()
  })

  it('should not permit registration of already registered names', async () => {
    const { baseRegistrar, controllerAccount, registrantAccount } =
      await loadFixture(fixtureWithRegistration)

    await expect(baseRegistrar)
      .write(
        'register',
        [toLabelId('newname'), registrantAccount.address, 86400n],
        {
          account: controllerAccount,
        },
      )
      .toBeRevertedWithoutReason()
  })

  it('should not permit renewing a name that is not registered', async () => {
    const { baseRegistrar, controllerAccount } = await loadFixture(fixture)

    await expect(baseRegistrar)
      .write('renew', [toLabelId('newname'), 86400n], {
        account: controllerAccount,
      })
      .toBeRevertedWithoutReason()
  })

  it('should permit the owner to reclaim a name', async () => {
    const { ensRegistry, baseRegistrar, registrantAccount } = await loadFixture(
      fixtureWithRegistration,
    )

    await ensRegistry.write.setOwner([namehash('newname.eth'), zeroAddress], {
      account: registrantAccount,
    })
    await baseRegistrar.write.reclaim(
      [toLabelId('newname'), registrantAccount.address],
      {
        account: registrantAccount,
      },
    )

    await expect(
      ensRegistry.read.owner([namehash('newname.eth')]),
    ).resolves.toEqualAddress(registrantAccount.address)
  })

  it('should prohibit anyone else from reclaiming a name', async () => {
    const { ensRegistry, baseRegistrar, registrantAccount, otherAccount } =
      await loadFixture(fixtureWithRegistration)

    await ensRegistry.write.setOwner([namehash('newname.eth'), zeroAddress], {
      account: registrantAccount,
    })

    await expect(baseRegistrar)
      .write('reclaim', [toLabelId('newname'), registrantAccount.address], {
        account: otherAccount,
      })
      .toBeRevertedWithoutReason()
  })

  it('should permit the owner to transfer a registration', async () => {
    const { ensRegistry, baseRegistrar, registrantAccount, otherAccount } =
      await loadFixture(fixtureWithRegistration)

    await baseRegistrar.write.transferFrom(
      [registrantAccount.address, otherAccount.address, toLabelId('newname')],
      {
        account: registrantAccount,
      },
    )

    await expect(
      baseRegistrar.read.ownerOf([toLabelId('newname')]),
    ).resolves.toEqualAddress(otherAccount.address)
    await expect(
      ensRegistry.read.owner([namehash('newname.eth')]),
    ).resolves.toEqualAddress(registrantAccount.address)

    await baseRegistrar.write.transferFrom(
      [otherAccount.address, registrantAccount.address, toLabelId('newname')],
      {
        account: otherAccount,
      },
    )
  })

  it('should prohibit anyone else from transferring a registration', async () => {
    const { baseRegistrar, otherAccount } = await loadFixture(
      fixtureWithRegistration,
    )

    await expect(baseRegistrar)
      .write(
        'transferFrom',
        [otherAccount.address, otherAccount.address, toLabelId('newname')],
        {
          account: otherAccount,
        },
      )
      .toBeRevertedWithString('ERC721: caller is not token owner or approved')
  })

  it('should not permit transfer or reclaim during the grace period', async () => {
    const { baseRegistrar, registrantAccount, otherAccount } =
      await loadFixture(fixtureWithRegistration)
    const testClient = await hre.viem.getTestClient()

    await testClient.increaseTime({ seconds: 86400 + 3600 })
    await testClient.mine({ blocks: 1 })

    await expect(baseRegistrar)
      .write(
        'transferFrom',
        [registrantAccount.address, otherAccount.address, toLabelId('newname')],
        {
          account: registrantAccount,
        },
      )
      .toBeRevertedWithoutReason()

    await expect(baseRegistrar)
      .write('reclaim', [toLabelId('newname'), registrantAccount.address], {
        account: registrantAccount,
      })
      .toBeRevertedWithoutReason()
  })

  it('should allow renewal during the grace period', async () => {
    const { baseRegistrar, controllerAccount } = await loadFixture(
      fixtureWithRegistration,
    )
    const testClient = await hre.viem.getTestClient()

    await testClient.increaseTime({ seconds: 86400 + 3600 })
    await testClient.mine({ blocks: 1 })

    await baseRegistrar.write.renew([toLabelId('newname'), 86400n], {
      account: controllerAccount,
    })
  })

  it('should allow registration of an expired domain', async () => {
    const { baseRegistrar, controllerAccount, otherAccount } =
      await loadFixture(fixtureWithRegistration)
    const testClient = await hre.viem.getTestClient()

    const gracePeriod = await baseRegistrar.read.GRACE_PERIOD()

    await testClient.increaseTime({
      seconds: 86400 + Number(gracePeriod) + 3600,
    })
    await testClient.mine({ blocks: 1 })

    await expect(baseRegistrar)
      .read('ownerOf', [toLabelId('newname')])
      .toBeRevertedWithoutReason()

    await baseRegistrar.write.register(
      [toLabelId('newname'), otherAccount.address, 86400n],
      {
        account: controllerAccount,
      },
    )

    await expect(
      baseRegistrar.read.ownerOf([toLabelId('newname')]),
    ).resolves.toEqualAddress(otherAccount.address)
  })

  it('should allow the owner to set a resolver address', async () => {
    const { ensRegistry, baseRegistrar, ownerAccount, controllerAccount } =
      await loadFixture(fixture)

    await baseRegistrar.write.setResolver([controllerAccount.address], {
      account: ownerAccount,
    })

    await expect(
      ensRegistry.read.resolver([namehash('eth')]),
    ).resolves.toEqualAddress(controllerAccount.address)
  })
})
