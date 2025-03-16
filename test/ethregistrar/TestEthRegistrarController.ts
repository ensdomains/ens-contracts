import { loadFixture } from '@nomicfoundation/hardhat-toolbox-viem/network-helpers.js'
import { expect } from 'chai'
import hre from 'hardhat'
import {
  Address,
  encodeFunctionData,
  hexToBigInt,
  labelhash,
  namehash,
  zeroAddress,
  zeroHash,
} from 'viem'
import { DAY, FUSES } from '../fixtures/constants.js'
import { getReverseName } from '../fixtures/ensip19.js'
import {
  commitName,
  getDefaultRegistrationOptions,
  getRegisterNameParameterArray,
  registerName,
} from '../fixtures/registerName.js'

const REGISTRATION_TIME = 28n * DAY
const BUFFERED_REGISTRATION_COST = REGISTRATION_TIME + 3n * DAY
const GRACE_PERIOD = 90n * DAY

const getAccounts = async () => {
  const [ownerClient, registrantClient, otherClient] =
    await hre.viem.getWalletClients()
  return {
    ownerAccount: ownerClient.account,
    ownerClient,
    registrantAccount: registrantClient.account,
    registrantClient,
    otherAccount: otherClient.account,
    otherClient,
  }
}

const labelId = (label: string) => hexToBigInt(labelhash(label))

async function fixture() {
  const publicClient = await hre.viem.getPublicClient()
  const accounts = await getAccounts()
  const ensRegistry = await hre.viem.deployContract('ENSRegistry', [])
  const baseRegistrar = await hre.viem.deployContract(
    'BaseRegistrarImplementation',
    [ensRegistry.address, namehash('eth')],
  )
  const reverseRegistrar = await hre.viem.deployContract('ReverseRegistrar', [
    ensRegistry.address,
  ])

  await ensRegistry.write.setSubnodeOwner([
    zeroHash,
    labelhash('reverse'),
    accounts.ownerAccount.address,
  ])
  await ensRegistry.write.setSubnodeOwner([
    namehash('reverse'),
    labelhash('addr'),
    reverseRegistrar.address,
  ])

  const nameWrapper = await hre.viem.deployContract('NameWrapper', [
    ensRegistry.address,
    baseRegistrar.address,
    accounts.ownerAccount.address,
  ])

  await ensRegistry.write.setSubnodeOwner([
    zeroHash,
    labelhash('eth'),
    baseRegistrar.address,
  ])

  const dummyOracle = await hre.viem.deployContract('DummyOracle', [100000000n])
  const priceOracle = await hre.viem.deployContract('StablePriceOracle', [
    dummyOracle.address,
    [0n, 0n, 4n, 2n, 1n],
  ])
  const ethRegistrarController = await hre.viem.deployContract(
    'ETHRegistrarController',
    [
      baseRegistrar.address,
      priceOracle.address,
      600n,
      86400n,
      reverseRegistrar.address,
      nameWrapper.address,
      ensRegistry.address,
    ],
  )

  await nameWrapper.write.setController([ethRegistrarController.address, true])
  await baseRegistrar.write.addController([nameWrapper.address])
  await reverseRegistrar.write.setController([
    ethRegistrarController.address,
    true,
  ])

  const publicResolver = await hre.viem.deployContract('PublicResolver', [
    ensRegistry.address,
    nameWrapper.address,
    ethRegistrarController.address,
    reverseRegistrar.address,
  ])

  const callData = [
    encodeFunctionData({
      abi: publicResolver.abi,
      functionName: 'setAddr',
      args: [namehash('newconfigname.eth'), accounts.registrantAccount.address],
    }),
    encodeFunctionData({
      abi: publicResolver.abi,
      functionName: 'setText',
      args: [namehash('newconfigname.eth'), 'url', 'ethereum.com'],
    }),
  ]

  return {
    ensRegistry,
    baseRegistrar,
    reverseRegistrar,
    nameWrapper,
    dummyOracle,
    priceOracle,
    ethRegistrarController,
    publicResolver,
    callData,
    publicClient,
    ...accounts,
  }
}

describe('ETHRegistrarController', () => {
  it('should report label validity', async () => {
    const checkLabels = {
      testing: true,
      longname12345678: true,
      sixsix: true,
      five5: true,
      four: true,
      iii: true,
      ii: false,
      i: false,
      '': false,

      // { ni } { hao } { ma } (chinese; simplified)
      你好吗: true,

      // { ta } { ko } (japanese; hiragana)
      たこ: false,

      // { poop } { poop } { poop } (emoji)
      '\ud83d\udca9\ud83d\udca9\ud83d\udca9': true,

      // { poop } { poop } (emoji)
      '\ud83d\udca9\ud83d\udca9': false,
    }

    const { ethRegistrarController } = await loadFixture(fixture)

    for (const label in checkLabels) {
      await expect(ethRegistrarController.read.valid([label])).resolves.toEqual(
        checkLabels[label as keyof typeof checkLabels],
      )
    }
  })

  it('should report unused names as available', async () => {
    const { ethRegistrarController } = await loadFixture(fixture)
    await expect(
      ethRegistrarController.read.available(['available']),
    ).resolves.toEqual(true)
  })

  it('should permit new registrations', async () => {
    const { ethRegistrarController, publicClient, registrantAccount } =
      await loadFixture(fixture)

    const balanceBefore = await publicClient.getBalance({
      address: ethRegistrarController.address,
    })

    const { args, params } = await commitName(
      { ethRegistrarController },
      {
        label: 'newname',
        duration: REGISTRATION_TIME,
        ownerAddress: registrantAccount.address,
      },
    )

    const timestamp = await publicClient.getBlock().then((b) => b.timestamp)

    await expect(ethRegistrarController)
      .write('register', args, { value: BUFFERED_REGISTRATION_COST })
      .toEmitEvent('NameRegistered')
      .withArgs(
        params.label,
        labelhash(params.label),
        params.ownerAddress,
        params.duration,
        0n,
        timestamp + params.duration,
      )

    await expect(
      publicClient.getBalance({ address: ethRegistrarController.address }),
    ).resolves.toEqual(REGISTRATION_TIME + balanceBefore)
  })

  it('should revert when not enough ether is transferred', async () => {
    const { ethRegistrarController, registrantAccount } = await loadFixture(
      fixture,
    )

    const { args } = await commitName(
      { ethRegistrarController },
      {
        label: 'newname',
        duration: REGISTRATION_TIME,
        ownerAddress: registrantAccount.address,
      },
    )

    await expect(ethRegistrarController)
      .write('register', args, { value: 0n })
      .toBeRevertedWithCustomError('InsufficientValue')
  })

  it('should report registered names as unavailable', async () => {
    const { ethRegistrarController } = await loadFixture(fixture)
    await registerName({ ethRegistrarController }, { label: 'newname' })
    await expect(
      ethRegistrarController.read.available(['newname']),
    ).resolves.toEqual(false)
  })

  it('should permit new registrations with resolver and records', async () => {
    const {
      ensRegistry,
      baseRegistrar,
      nameWrapper,
      ethRegistrarController,
      callData,
      publicResolver,
      publicClient,
      registrantAccount,
    } = await loadFixture(fixture)

    const { args, params } = await commitName(
      { ethRegistrarController },
      {
        label: 'newconfigname',
        duration: REGISTRATION_TIME,
        ownerAddress: registrantAccount.address,
        resolverAddress: publicResolver.address,
        data: callData,
      },
    )
    const timestamp = await publicClient.getBlock().then((b) => b.timestamp)

    await expect(ethRegistrarController)
      .write('register', args, { value: BUFFERED_REGISTRATION_COST })
      .toEmitEvent('NameRegistered')
      .withArgs(
        params.label,
        labelhash(params.label),
        params.ownerAddress,
        params.duration,
        0n,
        timestamp + params.duration,
      )

    await expect(
      publicClient.getBalance({ address: ethRegistrarController.address }),
    ).resolves.toEqual(REGISTRATION_TIME)

    const nodehash = namehash('newconfigname.eth')
    await expect(ensRegistry.read.resolver([nodehash])).resolves.toEqualAddress(
      publicResolver.address,
    )
    await expect(ensRegistry.read.owner([nodehash])).resolves.toEqualAddress(
      nameWrapper.address,
    )
    await expect(
      baseRegistrar.read.ownerOf([labelId('newconfigname')]),
    ).resolves.toEqualAddress(nameWrapper.address)
    await expect(
      publicResolver.read.addr([nodehash]) as Promise<Address>,
    ).resolves.toEqualAddress(registrantAccount.address)
    await expect(publicResolver.read.text([nodehash, 'url'])).resolves.toEqual(
      'ethereum.com',
    )
    await expect(
      nameWrapper.read.ownerOf([hexToBigInt(nodehash)]),
    ).resolves.toEqualAddress(registrantAccount.address)
  })

  it('should not permit new registrations with data and 0 resolver', async () => {
    const { ethRegistrarController, registrantAccount, callData } =
      await loadFixture(fixture)

    await expect(ethRegistrarController)
      .read(
        'makeCommitment',
        getRegisterNameParameterArray(
          await getDefaultRegistrationOptions({
            label: 'newconfigname',
            ownerAddress: registrantAccount.address,
            data: callData,
          }),
        ),
      )
      .toBeRevertedWithCustomError('ResolverRequiredWhenDataSupplied')
  })

  it('should not permit new registrations with EoA resolver', async () => {
    const { ethRegistrarController, registrantAccount, callData } =
      await loadFixture(fixture)

    const { args } = await commitName(
      { ethRegistrarController },
      {
        label: 'newconfigname',
        duration: REGISTRATION_TIME,
        ownerAddress: registrantAccount.address,
        resolverAddress: registrantAccount.address,
        data: callData,
      },
    )

    await expect(ethRegistrarController)
      .write('register', args, { value: BUFFERED_REGISTRATION_COST })
      .toBeRevertedWithoutReason()
  })

  it('should not permit new registrations with incompatible contract resolver', async () => {
    const { ethRegistrarController, registrantAccount, callData } =
      await loadFixture(fixture)

    const { args } = await commitName(
      { ethRegistrarController },
      {
        label: 'newconfigname',
        duration: REGISTRATION_TIME,
        ownerAddress: registrantAccount.address,
        resolverAddress: ethRegistrarController.address,
        data: callData,
      },
    )

    await expect(ethRegistrarController)
      .write('register', args, { value: BUFFERED_REGISTRATION_COST })
      .toBeRevertedWithoutReason()
  })

  it('should not permit new registrations with records updating a different name', async () => {
    const { ethRegistrarController, publicResolver, registrantAccount } =
      await loadFixture(fixture)

    const { args } = await commitName(
      { ethRegistrarController },
      {
        label: 'awesome',
        duration: REGISTRATION_TIME,
        ownerAddress: registrantAccount.address,
        resolverAddress: publicResolver.address,
        data: [
          encodeFunctionData({
            abi: publicResolver.abi,
            functionName: 'setAddr',
            args: [namehash('othername.eth'), registrantAccount.address],
          }),
        ],
      },
    )

    await expect(ethRegistrarController)
      .write('register', args, { value: BUFFERED_REGISTRATION_COST })
      .toBeRevertedWithString(
        'multicall: All records must have a matching namehash',
      )
  })

  it('should not permit new registrations with any record updating a different name', async () => {
    const { ethRegistrarController, publicResolver, registrantAccount } =
      await loadFixture(fixture)

    const { args } = await commitName(
      { ethRegistrarController },
      {
        label: 'awesome',
        duration: REGISTRATION_TIME,
        ownerAddress: registrantAccount.address,
        resolverAddress: publicResolver.address,
        data: [
          encodeFunctionData({
            abi: publicResolver.abi,
            functionName: 'setAddr',
            args: [namehash('awesome.eth'), registrantAccount.address],
          }),
          encodeFunctionData({
            abi: publicResolver.abi,
            functionName: 'setText',
            args: [namehash('othername.eth'), 'url', 'ethereum.com'],
          }),
        ],
      },
    )

    await expect(ethRegistrarController)
      .write('register', args, { value: BUFFERED_REGISTRATION_COST })
      .toBeRevertedWithString(
        'multicall: All records must have a matching namehash',
      )
  })

  it('should permit a registration with resolver but no records', async () => {
    const {
      ensRegistry,
      ethRegistrarController,
      publicResolver,
      publicClient,
      registrantAccount,
    } = await loadFixture(fixture)

    const { args, params } = await commitName(
      { ethRegistrarController },
      {
        label: 'newconfigname',
        duration: REGISTRATION_TIME,
        ownerAddress: registrantAccount.address,
        resolverAddress: publicResolver.address,
      },
    )
    const timestamp = await publicClient.getBlock().then((b) => b.timestamp)

    await expect(ethRegistrarController)
      .write('register', args, { value: BUFFERED_REGISTRATION_COST })
      .toEmitEvent('NameRegistered')
      .withArgs(
        params.label,
        labelhash(params.label),
        params.ownerAddress,
        params.duration,
        0n,
        timestamp + params.duration,
      )

    const nodehash = namehash('newconfigname.eth')
    await expect(ensRegistry.read.resolver([nodehash])).resolves.toEqualAddress(
      publicResolver.address,
    )
    await expect<Promise<Address>>(
      publicResolver.read.addr([nodehash]),
    ).resolves.toEqual(zeroAddress)
    await expect(
      publicClient.getBalance({ address: ethRegistrarController.address }),
    ).resolves.toEqual(REGISTRATION_TIME)
  })

  it('should include the owner in the commitment', async () => {
    const { ethRegistrarController, registrantAccount, otherAccount } =
      await loadFixture(fixture)

    let { args, params } = await commitName(
      { ethRegistrarController },
      {
        label: 'newname',
        duration: REGISTRATION_TIME,
        ownerAddress: otherAccount.address,
      },
    )

    args[1] = registrantAccount.address

    await expect(ethRegistrarController)
      .write('register', args, { value: BUFFERED_REGISTRATION_COST })
      .toBeRevertedWithCustomError('CommitmentTooOld')
  })

  it('should reject duplicate registrations', async () => {
    const { ethRegistrarController, registrantAccount } = await loadFixture(
      fixture,
    )

    const label = 'newname'

    await registerName(
      { ethRegistrarController },
      {
        label,
        duration: REGISTRATION_TIME,
        ownerAddress: registrantAccount.address,
      },
    )

    const { args } = await commitName(
      { ethRegistrarController },
      {
        label,
        duration: REGISTRATION_TIME,
        ownerAddress: registrantAccount.address,
      },
    )

    await expect(ethRegistrarController)
      .write('register', args, { value: BUFFERED_REGISTRATION_COST })
      .toBeRevertedWithCustomError('NameNotAvailable')
      .withArgs(label)
  })

  it('should reject for expired commitments', async () => {
    const { ethRegistrarController, registrantAccount } = await loadFixture(
      fixture,
    )
    const testClient = await hre.viem.getTestClient()

    const { args, hash } = await commitName(
      { ethRegistrarController },
      {
        label: 'newname',
        duration: REGISTRATION_TIME,
        ownerAddress: registrantAccount.address,
      },
    )

    const minCommitmentAge =
      await ethRegistrarController.read.minCommitmentAge()
    const maxCommitmentAge =
      await ethRegistrarController.read.maxCommitmentAge()

    await testClient.increaseTime({
      seconds: Number(maxCommitmentAge - minCommitmentAge) + 1,
    })

    await expect(ethRegistrarController)
      .write('register', args, { value: BUFFERED_REGISTRATION_COST })
      .toBeRevertedWithCustomError('CommitmentTooOld')
      .withArgs(hash)
  })

  it('should allow anyone to renew a name and change fuse expiry', async () => {
    const {
      baseRegistrar,
      ethRegistrarController,
      nameWrapper,
      publicClient,
      registrantAccount,
    } = await loadFixture(fixture)
    await registerName(
      { ethRegistrarController },
      {
        label: 'newname',
        duration: REGISTRATION_TIME,
        ownerAddress: registrantAccount.address,
      },
    )

    const nodehash = namehash('newname.eth')
    const fuseExpiry = await nameWrapper.read
      .getData([hexToBigInt(nodehash)])
      .then((d) => d[2])
    const expires = await baseRegistrar.read.nameExpires([labelId('newname')])
    const balanceBefore = await publicClient.getBalance({
      address: ethRegistrarController.address,
    })

    const duration = 86400n
    const { base: price } = await ethRegistrarController.read.rentPrice([
      'newname',
      duration,
    ])

    await ethRegistrarController.write.renew(['newname', duration], {
      value: price,
    })

    const newExpires = await baseRegistrar.read.nameExpires([
      labelId('newname'),
    ])
    const newFuseExpiry = await nameWrapper.read
      .getData([hexToBigInt(nodehash)])
      .then((d) => d[2])

    expect(newExpires - expires).toEqual(duration)
    expect(newFuseExpiry - fuseExpiry).toEqual(duration)

    await expect(
      publicClient.getBalance({ address: ethRegistrarController.address }),
    ).resolves.toEqual(balanceBefore + price)
  })

  it('should allow token owners to renew a name', async () => {
    const {
      baseRegistrar,
      ethRegistrarController,
      nameWrapper,
      publicClient,
      registrantAccount,
    } = await loadFixture(fixture)
    await registerName(
      { ethRegistrarController },
      {
        label: 'newname',
        duration: REGISTRATION_TIME,
        ownerAddress: registrantAccount.address,
      },
    )

    const nodehash = namehash('newname.eth')
    const fuseExpiry = await nameWrapper.read
      .getData([hexToBigInt(nodehash)])
      .then((d) => d[2])
    const expires = await baseRegistrar.read.nameExpires([labelId('newname')])
    const balanceBefore = await publicClient.getBalance({
      address: ethRegistrarController.address,
    })

    const duration = 86400n
    const { base: price } = await ethRegistrarController.read.rentPrice([
      'newname',
      duration,
    ])

    await ethRegistrarController.write.renew(['newname', duration], {
      value: price,
    })

    const newExpires = await baseRegistrar.read.nameExpires([
      labelId('newname'),
    ])
    const newFuseExpiry = await nameWrapper.read
      .getData([hexToBigInt(nodehash)])
      .then((d) => d[2])

    expect(newExpires - expires).toEqual(duration)
    expect(newFuseExpiry - fuseExpiry).toEqual(duration)

    await expect(
      publicClient.getBalance({ address: ethRegistrarController.address }),
    ).resolves.toEqual(balanceBefore + price)
  })

  it('non wrapped names can renew', async () => {
    const { nameWrapper, baseRegistrar, ethRegistrarController, ownerAccount } =
      await loadFixture(fixture)

    const label = 'newname'
    const tokenId = labelId(label)
    const nodehash = namehash(`${label}.eth`)
    const duration = 86400n
    // this is to allow user to register without namewrapped
    await baseRegistrar.write.addController([ownerAccount.address])
    await baseRegistrar.write.register([
      tokenId,
      ownerAccount.address,
      duration,
    ])

    await expect(
      nameWrapper.read.ownerOf([hexToBigInt(nodehash)]),
    ).resolves.toEqual(zeroAddress)
    await expect(baseRegistrar.read.ownerOf([tokenId])).resolves.toEqualAddress(
      ownerAccount.address,
    )

    const expires = await baseRegistrar.read.nameExpires([tokenId])
    const { base: price } = await ethRegistrarController.read.rentPrice([
      label,
      duration,
    ])
    await ethRegistrarController.write.renew([label, duration], {
      value: price,
    })

    await expect(baseRegistrar.read.ownerOf([tokenId])).resolves.toEqualAddress(
      ownerAccount.address,
    )
    await expect(
      nameWrapper.read.ownerOf([hexToBigInt(nodehash)]),
    ).resolves.toEqual(zeroAddress)

    const newExpires = await baseRegistrar.read.nameExpires([tokenId])
    expect(newExpires - expires).toEqual(duration)
  })

  it('should require sufficient value for a renewal', async () => {
    const { ethRegistrarController } = await loadFixture(fixture)

    await expect(ethRegistrarController)
      .write('renew', ['newname', 86400n])
      .toBeRevertedWithCustomError('InsufficientValue')
  })

  it('should allow anyone to withdraw funds and transfer to the registrar owner', async () => {
    const { ethRegistrarController, ownerAccount, publicClient } =
      await loadFixture(fixture)

    await registerName(
      { ethRegistrarController },
      {
        label: 'newname',
        duration: REGISTRATION_TIME,
        ownerAddress: ownerAccount.address,
      },
    )

    await ethRegistrarController.write.withdraw()
    await expect(
      publicClient.getBalance({ address: ethRegistrarController.address }),
    ).resolves.toEqual(0n)
  })

  it('should set the reverse record of the account', async () => {
    const {
      ethRegistrarController,
      publicResolver,
      registrantAccount,
      ownerAccount,
    } = await loadFixture(fixture)

    await registerName(
      { ethRegistrarController },
      {
        label: 'reverse',
        duration: REGISTRATION_TIME,
        ownerAddress: registrantAccount.address,
        resolverAddress: publicResolver.address,
        shouldSetReverseRecord: true,
      },
    )

    await expect(
      publicResolver.read.name([
        namehash(getReverseName(ownerAccount.address)),
      ]),
    ).resolves.toEqual('reverse.eth')
  })

  it('should not set the reverse record of the account when set to false', async () => {
    const { ethRegistrarController, publicResolver, registrantAccount } =
      await loadFixture(fixture)

    await registerName(
      { ethRegistrarController },
      {
        label: 'reverse',
        duration: REGISTRATION_TIME,
        ownerAddress: registrantAccount.address,
        resolverAddress: publicResolver.address,
        shouldSetReverseRecord: false,
      },
    )

    await expect(
      publicResolver.read.name([
        namehash(getReverseName(registrantAccount.address)),
      ]),
    ).resolves.toEqual('')
  })

  it('should auto wrap the name and set the ERC721 owner to the wrapper', async () => {
    const {
      ensRegistry,
      baseRegistrar,
      ethRegistrarController,
      nameWrapper,
      registrantAccount,
    } = await loadFixture(fixture)

    const label = 'wrapper'
    const name = label + '.eth'
    await registerName(
      { ethRegistrarController },
      {
        label,
        duration: REGISTRATION_TIME,
        ownerAddress: registrantAccount.address,
      },
    )

    await expect(
      nameWrapper.read.ownerOf([hexToBigInt(namehash(name))]),
    ).resolves.toEqualAddress(registrantAccount.address)

    await expect(
      ensRegistry.read.owner([namehash(name)]),
    ).resolves.toEqualAddress(nameWrapper.address)
    await expect(
      baseRegistrar.read.ownerOf([labelId(label)]),
    ).resolves.toEqualAddress(nameWrapper.address)
  })

  it('should auto wrap the name and allow fuses and expiry to be set', async () => {
    const {
      publicClient,
      ethRegistrarController,
      nameWrapper,
      registrantAccount,
    } = await loadFixture(fixture)

    const label = 'fuses'
    const name = label + '.eth'

    await registerName(
      { ethRegistrarController },
      {
        label,
        duration: REGISTRATION_TIME,
        ownerAddress: registrantAccount.address,
        ownerControlledFuses: 1,
      },
    )

    const block = await publicClient.getBlock()

    const [, fuses, expiry] = await nameWrapper.read.getData([
      hexToBigInt(namehash(name)),
    ])
    expect(fuses).toEqual(
      FUSES.PARENT_CANNOT_CONTROL | FUSES.CANNOT_UNWRAP | FUSES.IS_DOT_ETH,
    )
    expect(expiry).toEqual(REGISTRATION_TIME + GRACE_PERIOD + block.timestamp)
  })

  it('approval should reduce gas for registration', async () => {
    const {
      publicClient,
      ensRegistry,
      baseRegistrar,
      ethRegistrarController,
      nameWrapper,
      registrantAccount,
      publicResolver,
    } = await loadFixture(fixture)

    const label = 'other'
    const name = label + '.eth'
    const node = namehash(name)

    const { args } = await commitName(
      { ethRegistrarController },
      {
        label,
        duration: REGISTRATION_TIME,
        ownerAddress: registrantAccount.address,
        resolverAddress: publicResolver.address,
        data: [
          encodeFunctionData({
            abi: publicResolver.abi,
            functionName: 'setAddr',
            args: [node, registrantAccount.address],
          }),
        ],
        ownerControlledFuses: 1,
        shouldSetReverseRecord: true,
      },
    )

    const gasA = await ethRegistrarController.estimateGas.register(args, {
      value: BUFFERED_REGISTRATION_COST,
      account: registrantAccount,
    })

    await publicResolver.write.setApprovalForAll(
      [ethRegistrarController.address, true],
      { account: registrantAccount },
    )

    const gasB = await ethRegistrarController.estimateGas.register(args, {
      value: BUFFERED_REGISTRATION_COST,
      account: registrantAccount,
    })

    const hash = await ethRegistrarController.write.register(args, {
      value: BUFFERED_REGISTRATION_COST,
      account: registrantAccount,
    })

    const receipt = await publicClient.getTransactionReceipt({ hash })

    expect(receipt.gasUsed).toBeLessThan(gasA)

    console.log('Gas saved:', gasA - receipt.gasUsed)

    await expect(
      nameWrapper.read.ownerOf([hexToBigInt(node)]),
    ).resolves.toEqualAddress(registrantAccount.address)
    await expect(ensRegistry.read.owner([node])).resolves.toEqualAddress(
      nameWrapper.address,
    )
    await expect(
      baseRegistrar.read.ownerOf([labelId(label)]),
    ).resolves.toEqualAddress(nameWrapper.address)
    await expect<Promise<Address>>(
      publicResolver.read.addr([node]),
    ).resolves.toEqualAddress(registrantAccount.address)
  })

  it('should not permit new registrations with non resolver function calls', async () => {
    const {
      baseRegistrar,
      ethRegistrarController,
      registrantAccount,
      publicResolver,
    } = await loadFixture(fixture)

    const label = 'newconfigname'
    const name = label + '.eth'
    const node = namehash(name)
    const secondTokenDuration = 788400000n // keep bogus NFT for 25 years;
    const callData = [
      encodeFunctionData({
        abi: baseRegistrar.abi,
        functionName: 'register',
        args: [
          hexToBigInt(node),
          registrantAccount.address,
          secondTokenDuration,
        ],
      }),
    ]

    const { args } = await commitName(
      { ethRegistrarController },
      {
        label,
        duration: REGISTRATION_TIME,
        ownerAddress: registrantAccount.address,
        resolverAddress: publicResolver.address,
        data: callData,
      },
    )

    await expect(ethRegistrarController)
      .write('register', args, { value: BUFFERED_REGISTRATION_COST })
      .toBeRevertedWithoutReason()
  })
})
