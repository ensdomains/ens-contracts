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
import { DAY } from '../fixtures/constants.js'
import { getReverseName } from '../fixtures/ensip19.js'
import {
  commitName,
  getDefaultRegistrationOptions,
  getRegisterNameParameters,
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
  const defaultReverseRegistrar = await hre.viem.deployContract(
    'DefaultReverseRegistrar',
    [],
  )

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
      defaultReverseRegistrar.address,
      ensRegistry.address,
    ],
  )

  await baseRegistrar.write.addController([ethRegistrarController.address])
  await reverseRegistrar.write.setController([
    ethRegistrarController.address,
    true,
  ])
  await defaultReverseRegistrar.write.setController([
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
    dummyOracle,
    priceOracle,
    ethRegistrarController,
    publicResolver,
    defaultReverseRegistrar,
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
      .write('register', [args], { value: BUFFERED_REGISTRATION_COST })
      .toEmitEvent('NameRegistered')
      .withArgs(
        params.label,
        labelhash(params.label),
        params.ownerAddress,
        params.duration,
        0n,
        timestamp + params.duration,
        params.referrer,
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
      .write('register', [args], { value: 0n })
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
      .write('register', [args], { value: BUFFERED_REGISTRATION_COST })
      .toEmitEvent('NameRegistered')
      .withArgs(
        params.label,
        labelhash(params.label),
        params.ownerAddress,
        params.duration,
        0n,
        timestamp + params.duration,
        params.referrer,
      )

    await expect(
      publicClient.getBalance({ address: ethRegistrarController.address }),
    ).resolves.toEqual(REGISTRATION_TIME)

    const nodehash = namehash('newconfigname.eth')
    await expect(ensRegistry.read.resolver([nodehash])).resolves.toEqualAddress(
      publicResolver.address,
    )
    await expect(ensRegistry.read.owner([nodehash])).resolves.toEqualAddress(
      registrantAccount.address,
    )
    await expect(
      baseRegistrar.read.ownerOf([labelId('newconfigname')]),
    ).resolves.toEqualAddress(registrantAccount.address)
    await expect(
      publicResolver.read.addr([nodehash]) as Promise<Address>,
    ).resolves.toEqualAddress(registrantAccount.address)
    await expect(publicResolver.read.text([nodehash, 'url'])).resolves.toEqual(
      'ethereum.com',
    )
  })

  it('should not permit new registrations with data and 0 resolver', async () => {
    const { ethRegistrarController, registrantAccount, callData } =
      await loadFixture(fixture)

    await expect(ethRegistrarController)
      .read('makeCommitment', [
        getRegisterNameParameters(
          await getDefaultRegistrationOptions({
            label: 'newconfigname',
            ownerAddress: registrantAccount.address,
            data: callData,
          }),
        ),
      ])
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
      .write('register', [args], { value: BUFFERED_REGISTRATION_COST })
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
      .write('register', [args], { value: BUFFERED_REGISTRATION_COST })
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
      .write('register', [args], { value: BUFFERED_REGISTRATION_COST })
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
      .write('register', [args], { value: BUFFERED_REGISTRATION_COST })
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
      .write('register', [args], { value: BUFFERED_REGISTRATION_COST })
      .toEmitEvent('NameRegistered')
      .withArgs(
        params.label,
        labelhash(params.label),
        params.ownerAddress,
        params.duration,
        0n,
        timestamp + params.duration,
        params.referrer,
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

    let { args } = await commitName(
      { ethRegistrarController },
      {
        label: 'newname',
        duration: REGISTRATION_TIME,
        ownerAddress: otherAccount.address,
      },
    )

    args.owner = registrantAccount.address

    await expect(ethRegistrarController)
      .write('register', [args], { value: BUFFERED_REGISTRATION_COST })
      .toBeRevertedWithCustomError('CommitmentNotFound')
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
      .write('register', [args], { value: BUFFERED_REGISTRATION_COST })
      .toBeRevertedWithCustomError('NameNotAvailable')
      .withArgs(label)
  })

  it('should reject for expired commitments', async () => {
    const { ethRegistrarController, registrantAccount } = await loadFixture(
      fixture,
    )
    const testClient = await hre.viem.getTestClient()
    const publicClient = await hre.viem.getPublicClient()

    const { args, hash } = await commitName(
      { ethRegistrarController },
      {
        label: 'newname',
        duration: REGISTRATION_TIME,
        ownerAddress: registrantAccount.address,
      },
    )

    const commitmentTimestamp = await ethRegistrarController.read.commitments([
      hash,
    ])
    const minCommitmentAge =
      await ethRegistrarController.read.minCommitmentAge()
    const maxCommitmentAge =
      await ethRegistrarController.read.maxCommitmentAge()

    const timestampIncrease = maxCommitmentAge - minCommitmentAge + 1n
    await testClient.increaseTime({
      seconds: Number(timestampIncrease),
    })
    const previousBlockTimestamp = await publicClient
      .getBlock()
      .then((b) => b.timestamp)

    await expect(ethRegistrarController)
      .write('register', [args], { value: BUFFERED_REGISTRATION_COST })
      .toBeRevertedWithCustomError('CommitmentTooOld')
      .withArgs(
        hash,
        commitmentTimestamp + maxCommitmentAge,
        previousBlockTimestamp + timestampIncrease,
      )
  })

  it('should allow token owners to renew a name', async () => {
    const {
      baseRegistrar,
      ethRegistrarController,
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

    const expires = await baseRegistrar.read.nameExpires([labelId('newname')])
    const balanceBefore = await publicClient.getBalance({
      address: ethRegistrarController.address,
    })

    const duration = 86400n
    const { base: price } = await ethRegistrarController.read.rentPrice([
      'newname',
      duration,
    ])

    await ethRegistrarController.write.renew(['newname', duration, zeroHash], {
      value: price,
    })

    const newExpires = await baseRegistrar.read.nameExpires([
      labelId('newname'),
    ])

    expect(newExpires - expires).toEqual(duration)

    await expect(
      publicClient.getBalance({ address: ethRegistrarController.address }),
    ).resolves.toEqual(balanceBefore + price)
  })

  it('should allow non-owner to renew a name', async () => {
    const {
      baseRegistrar,
      ethRegistrarController,
      publicClient,
      registrantAccount,
      otherAccount,
    } = await loadFixture(fixture)
    await registerName(
      { ethRegistrarController },
      {
        label: 'newname',
        duration: REGISTRATION_TIME,
        ownerAddress: registrantAccount.address,
      },
    )

    const expires = await baseRegistrar.read.nameExpires([labelId('newname')])
    const balanceBefore = await publicClient.getBalance({
      address: ethRegistrarController.address,
    })

    const duration = 86400n
    const { base: price } = await ethRegistrarController.read.rentPrice([
      'newname',
      duration,
    ])

    await ethRegistrarController.write.renew(['newname', duration, zeroHash], {
      account: otherAccount,
      value: price,
    })

    const newExpires = await baseRegistrar.read.nameExpires([
      labelId('newname'),
    ])

    expect(newExpires - expires).toEqual(duration)

    await expect(
      publicClient.getBalance({ address: ethRegistrarController.address }),
    ).resolves.toEqual(balanceBefore + price)
  })

  it('should require sufficient value for a renewal', async () => {
    const { ethRegistrarController } = await loadFixture(fixture)

    await expect(ethRegistrarController)
      .write('renew', ['newname', 86400n, zeroHash])
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

  it('should set the ethereum reverse record of the account', async () => {
    const {
      ethRegistrarController,
      defaultReverseRegistrar,
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
        reverseRecord: ['ethereum'],
      },
    )

    await expect(
      publicResolver.read.name([
        namehash(getReverseName(ownerAccount.address)),
      ]),
    ).resolves.toEqual('reverse.eth')
    await expect(
      defaultReverseRegistrar.read.nameForAddr([ownerAccount.address]),
    ).resolves.toEqual('')
  })

  it('should set the default reverse record of the account', async () => {
    const {
      ethRegistrarController,
      defaultReverseRegistrar,
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
        reverseRecord: ['default'],
      },
    )

    await expect(
      publicResolver.read.name([
        namehash(getReverseName(ownerAccount.address)),
      ]),
    ).resolves.toEqual('')
    await expect(
      defaultReverseRegistrar.read.nameForAddr([ownerAccount.address]),
    ).resolves.toEqual('reverse.eth')
  })

  it('should set the ethereum and default reverse records of the account', async () => {
    const {
      ethRegistrarController,
      defaultReverseRegistrar,
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
        reverseRecord: ['ethereum', 'default'],
      },
    )

    await expect(
      publicResolver.read.name([
        namehash(getReverseName(ownerAccount.address)),
      ]),
    ).resolves.toEqual('reverse.eth')
    await expect(
      defaultReverseRegistrar.read.nameForAddr([ownerAccount.address]),
    ).resolves.toEqual('reverse.eth')
  })

  it('should not set the reverse record of the account when set to false', async () => {
    const {
      ethRegistrarController,
      defaultReverseRegistrar,
      publicResolver,
      ownerAccount,
      registrantAccount,
    } = await loadFixture(fixture)

    await registerName(
      { ethRegistrarController },
      {
        label: 'reverse',
        duration: REGISTRATION_TIME,
        ownerAddress: registrantAccount.address,
        resolverAddress: publicResolver.address,
        reverseRecord: [],
      },
    )

    await expect(
      publicResolver.read.name([
        namehash(getReverseName(ownerAccount.address)),
      ]),
    ).resolves.toEqual('')
    await expect(
      defaultReverseRegistrar.read.nameForAddr([ownerAccount.address]),
    ).resolves.toEqual('')
  })

  it('should not permit setting the default reverse record without a resolver', async () => {
    const { ethRegistrarController, registrantAccount } = await loadFixture(
      fixture,
    )

    const params = await getDefaultRegistrationOptions({
      label: 'reverse',
      duration: REGISTRATION_TIME,
      ownerAddress: registrantAccount.address,
      reverseRecord: ['default'],
    })
    const args = getRegisterNameParameters(params)

    await expect(ethRegistrarController)
      .read('makeCommitment', [args])
      .toBeRevertedWithCustomError('ResolverRequiredForReverseRecord')

    await commitName(
      { ethRegistrarController },
      {
        ...params,
        createLocalCommitmentHash: true,
      },
    )

    await expect(ethRegistrarController)
      .write('register', [args], { value: BUFFERED_REGISTRATION_COST })
      .toBeRevertedWithCustomError('ResolverRequiredForReverseRecord')
  })

  it('should not permit setting the ethereum reverse record without a resolver', async () => {
    const { ethRegistrarController, registrantAccount } = await loadFixture(
      fixture,
    )

    const params = await getDefaultRegistrationOptions({
      label: 'reverse',
      duration: REGISTRATION_TIME,
      ownerAddress: registrantAccount.address,
      reverseRecord: ['ethereum'],
    })
    const args = getRegisterNameParameters(params)

    await expect(ethRegistrarController)
      .read('makeCommitment', [args])
      .toBeRevertedWithCustomError('ResolverRequiredForReverseRecord')

    await commitName(
      { ethRegistrarController },
      {
        ...params,
        createLocalCommitmentHash: true,
      },
    )

    await expect(ethRegistrarController)
      .write('register', [args], { value: BUFFERED_REGISTRATION_COST })
      .toBeRevertedWithCustomError('ResolverRequiredForReverseRecord')
  })

  it('should not permit setting both reverse records without a resolver', async () => {
    const { ethRegistrarController, registrantAccount } = await loadFixture(
      fixture,
    )

    const params = await getDefaultRegistrationOptions({
      label: 'reverse',
      duration: REGISTRATION_TIME,
      ownerAddress: registrantAccount.address,
      reverseRecord: ['ethereum', 'default'],
    })
    const args = getRegisterNameParameters(params)

    await expect(ethRegistrarController)
      .read('makeCommitment', [args])
      .toBeRevertedWithCustomError('ResolverRequiredForReverseRecord')

    await commitName(
      { ethRegistrarController },
      {
        ...params,
        createLocalCommitmentHash: true,
      },
    )

    await expect(ethRegistrarController)
      .write('register', [args], { value: BUFFERED_REGISTRATION_COST })
      .toBeRevertedWithCustomError('ResolverRequiredForReverseRecord')
  })

  it('approval should reduce gas for registration', async () => {
    const {
      publicClient,
      ensRegistry,
      baseRegistrar,
      ethRegistrarController,
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
        reverseRecord: ['ethereum'],
      },
    )

    const gasA = await ethRegistrarController.estimateGas.register([args], {
      value: BUFFERED_REGISTRATION_COST,
      account: registrantAccount,
    })

    await publicResolver.write.setApprovalForAll(
      [ethRegistrarController.address, true],
      { account: registrantAccount },
    )

    const gasB = await ethRegistrarController.estimateGas.register([args], {
      value: BUFFERED_REGISTRATION_COST,
      account: registrantAccount,
    })

    const hash = await ethRegistrarController.write.register([args], {
      value: BUFFERED_REGISTRATION_COST,
      account: registrantAccount,
    })

    const receipt = await publicClient.getTransactionReceipt({ hash })

    expect(receipt.gasUsed).toBeLessThan(gasA)

    console.log('Gas saved:', gasA - receipt.gasUsed)

    await expect(
      baseRegistrar.read.ownerOf([labelId(label)]),
    ).resolves.toEqualAddress(registrantAccount.address)
    await expect(ensRegistry.read.owner([node])).resolves.toEqualAddress(
      registrantAccount.address,
    )
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
      .write('register', [args], { value: BUFFERED_REGISTRATION_COST })
      .toBeRevertedWithoutReason()
  })

  it('should emit the referrer when a name is registered', async () => {
    const {
      ethRegistrarController,
      registrantAccount,
      otherAccount,
      publicClient,
    } = await loadFixture(fixture)

    const timestamp = await publicClient.getBlock().then((b) => b.timestamp)

    const referrer = namehash('referrer.eth')
    const { args, params } = await commitName(
      { ethRegistrarController },
      {
        label: 'newname',
        duration: REGISTRATION_TIME,
        ownerAddress: registrantAccount.address,
        referrer,
      },
    )

    await expect(ethRegistrarController)
      .write('register', [args], { value: BUFFERED_REGISTRATION_COST })
      .toEmitEvent('NameRegistered')
      .withArgs(
        params.label,
        labelhash(params.label),
        params.ownerAddress,
        params.duration,
        0n,
        timestamp + params.duration,
        referrer,
      )
  })

  it('should emit the referrer when a name is renewed', async () => {
    const {
      baseRegistrar,
      ethRegistrarController,
      registrantAccount,
      otherAccount,
    } = await loadFixture(fixture)

    const label = 'newname'
    const referrer = namehash('referrer.eth')
    const duration = 86400n
    await registerName(
      { ethRegistrarController },
      {
        label,
        duration: REGISTRATION_TIME,
        ownerAddress: registrantAccount.address,
      },
    )

    const expires = await baseRegistrar.read.nameExpires([labelId(label)])

    await expect(ethRegistrarController)
      .write('renew', [label, duration, referrer], { value: duration })
      .toEmitEvent('NameRenewed')
      .withArgs(label, labelhash(label), duration, expires + duration, referrer)
  })
})
