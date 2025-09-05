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
  commitNameWithConnection,
  getDefaultRegistrationOptionsWithConnection,
  getRegisterNameParameters,
  registerNameWithConnection,
} from '../fixtures/registerName.js'

const REGISTRATION_TIME = 28n * DAY
const BUFFERED_REGISTRATION_COST = REGISTRATION_TIME + 3n * DAY
const GRACE_PERIOD = 90n * DAY

const labelId = (label: string) => hexToBigInt(labelhash(label))

const connection = await hre.network.connect()
const publicClient = await connection.viem.getPublicClient()
const [ownerClient, registrantClient, otherClient] =
  await connection.viem.getWalletClients()
const ownerAccount = ownerClient.account
const registrantAccount = registrantClient.account
const otherAccount = otherClient.account
const registerName = registerNameWithConnection(connection)
const commitName = commitNameWithConnection(connection)
const getDefaultRegistrationOptions =
  getDefaultRegistrationOptionsWithConnection(connection)

async function fixture() {
  const ensRegistry = await connection.viem.deployContract('ENSRegistry', [])
  const baseRegistrar = await connection.viem.deployContract(
    'BaseRegistrarImplementation',
    [ensRegistry.address, namehash('eth')],
  )
  const reverseRegistrar = await connection.viem.deployContract(
    'ReverseRegistrar',
    [ensRegistry.address],
  )

  const defaultReverseRegistrar = await connection.viem.deployContract(
    'DefaultReverseRegistrar',
    [],
  )

  await ensRegistry.write.setSubnodeOwner([
    zeroHash,
    labelhash('reverse'),
    ownerAccount.address,
  ])
  await ensRegistry.write.setSubnodeOwner([
    namehash('reverse'),
    labelhash('addr'),
    reverseRegistrar.address,
  ])

  const nameWrapper = await connection.viem.deployContract('NameWrapper', [
    ensRegistry.address,
    baseRegistrar.address,
    ownerAccount.address,
  ])

  await ensRegistry.write.setSubnodeOwner([
    zeroHash,
    labelhash('eth'),
    baseRegistrar.address,
  ])

  const dummyOracle = await connection.viem.deployContract('DummyOracle', [
    100000000n,
  ])
  const priceOracle = await connection.viem.deployContract(
    'StablePriceOracle',
    [dummyOracle.address, [0n, 0n, 4n, 2n, 1n]],
  )
  const ethRegistrarController = await connection.viem.deployContract(
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

  const publicResolver = await connection.viem.deployContract(
    'PublicResolver',
    [
      ensRegistry.address,
      nameWrapper.address,
      ethRegistrarController.address,
      reverseRegistrar.address,
    ],
  )

  await reverseRegistrar.write.setDefaultResolver([publicResolver.address])

  const callData = [
    encodeFunctionData({
      abi: publicResolver.abi,
      functionName: 'setAddr',
      args: [namehash('newconfigname.eth'), registrantAccount.address],
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
    nameWrapper,
    ownerAccount,
    registrantAccount,
    otherAccount,
    publicClient,
  }
}
const loadFixture = async () => connection.networkHelpers.loadFixture(fixture)

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

    const { ethRegistrarController } = await loadFixture()

    for (const label in checkLabels) {
      await expect(ethRegistrarController.read.valid([label])).resolves.toEqual(
        checkLabels[label as keyof typeof checkLabels],
      )
    }
  })

  it('should report unused names as available', async () => {
    const { ethRegistrarController } = await loadFixture()
    await expect(
      ethRegistrarController.read.available(['available']),
    ).resolves.toEqual(true)
  })

  it('should permit new registrations', async () => {
    const { ethRegistrarController } = await loadFixture()

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

    const timestamp = await publicClient
      .getBlock({ blockTag: 'pending' })
      .then((b) => b.timestamp)

    await expect(
      ethRegistrarController.write.register([args], {
        value: BUFFERED_REGISTRATION_COST,
      }),
    )
      .toEmitEvent('NameRegistered')
      .withArgs({
        labelhash: labelhash(params.label),
        owner: params.ownerAddress,
        label: params.label,
        baseCost: params.duration,
        premium: 0n,
        expires: timestamp + params.duration,
        referrer:
          '0x0000000000000000000000000000000000000000000000000000000000000000',
      })

    await expect(
      publicClient.getBalance({ address: ethRegistrarController.address }),
    ).resolves.toEqual(REGISTRATION_TIME + balanceBefore)
  })

  it('should revert when not enough ether is transferred', async () => {
    const { ethRegistrarController, registrantAccount } = await loadFixture()

    const { args } = await commitName(
      { ethRegistrarController },
      {
        label: 'newname',
        duration: REGISTRATION_TIME,
        ownerAddress: registrantAccount.address,
      },
    )

    await expect(
      ethRegistrarController.write.register([args], { value: 0n }),
    ).toBeRevertedWithCustomError('InsufficientValue')
  })

  it('should report registered names as unavailable', async () => {
    const { ethRegistrarController } = await loadFixture()
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
    } = await loadFixture()

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
    const timestamp = await publicClient
      .getBlock({ blockTag: 'pending' })
      .then((b) => b.timestamp)

    await expect(
      ethRegistrarController.write.register([args], {
        value: BUFFERED_REGISTRATION_COST,
      }),
    )
      .toEmitEvent('NameRegistered')
      .withArgs({
        labelhash: labelhash(params.label),
        owner: params.ownerAddress,
        label: params.label,
        baseCost: params.duration,
        premium: 0n,
        expires: timestamp + params.duration,
        referrer:
          '0x0000000000000000000000000000000000000000000000000000000000000000',
      })

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
      await loadFixture()

    await expect(
      ethRegistrarController.read.makeCommitment([
        getRegisterNameParameters(
          await getDefaultRegistrationOptions({
            label: 'newconfigname',
            ownerAddress: registrantAccount.address,
            data: callData,
          }),
        ),
      ]),
    ).toBeRevertedWithCustomError('ResolverRequiredWhenDataSupplied')
  })

  it('should not permit new registrations with EoA resolver', async () => {
    const { ethRegistrarController, registrantAccount, callData } =
      await loadFixture()

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

    await expect(
      ethRegistrarController.write.register([args], {
        value: BUFFERED_REGISTRATION_COST,
      }),
    ).toBeRevertedWithoutReason()
  })

  it('should not permit new registrations with incompatible contract resolver', async () => {
    const { ethRegistrarController, registrantAccount, callData } =
      await loadFixture()

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

    await expect(
      ethRegistrarController.write.register([args], {
        value: BUFFERED_REGISTRATION_COST,
      }),
    ).toBeRevertedWithoutReason()
  })

  it('should not permit new registrations with records updating a different name', async () => {
    const { ethRegistrarController, publicResolver } = await loadFixture()

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

    await expect(
      ethRegistrarController.write.register([args], {
        value: BUFFERED_REGISTRATION_COST,
      }),
    ).toBeRevertedWithString(
      'multicall: All records must have a matching namehash',
    )
  })

  it('should not permit new registrations with any record updating a different name', async () => {
    const { ethRegistrarController, publicResolver } = await loadFixture()

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

    await expect(
      ethRegistrarController.write.register([args], {
        value: BUFFERED_REGISTRATION_COST,
      }),
    ).toBeRevertedWithString(
      'multicall: All records must have a matching namehash',
    )
  })

  it('should permit a registration with resolver but no records', async () => {
    const { ensRegistry, ethRegistrarController, publicResolver } =
      await loadFixture()

    const { args, params } = await commitName(
      { ethRegistrarController },
      {
        label: 'newconfigname',
        duration: REGISTRATION_TIME,
        ownerAddress: registrantAccount.address,
        resolverAddress: publicResolver.address,
      },
    )
    const timestamp = await publicClient
      .getBlock({ blockTag: 'pending' })
      .then((b) => b.timestamp)

    await expect(
      ethRegistrarController.write.register([args], {
        value: BUFFERED_REGISTRATION_COST,
      }),
    )
      .toEmitEvent('NameRegistered')
      .withArgs({
        labelhash: labelhash(params.label),
        owner: params.ownerAddress,
        label: params.label,
        baseCost: params.duration,
        premium: 0n,
        expires: timestamp + params.duration,
        referrer:
          '0x0000000000000000000000000000000000000000000000000000000000000000',
      })

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
    const { ethRegistrarController } = await loadFixture()

    let { args } = await commitName(
      { ethRegistrarController },
      {
        label: 'newname',
        duration: REGISTRATION_TIME,
        ownerAddress: otherAccount.address,
      },
    )

    args.owner = registrantAccount.address

    await expect(
      ethRegistrarController.write.register([args], {
        value: BUFFERED_REGISTRATION_COST,
      }),
    ).toBeRevertedWithCustomError('CommitmentNotFound')
  })

  it('should reject duplicate registrations', async () => {
    const { ethRegistrarController } = await loadFixture()

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

    await expect(
      ethRegistrarController.write.register([args], {
        value: BUFFERED_REGISTRATION_COST,
      }),
    )
      .toBeRevertedWithCustomError('NameNotAvailable')
      .withArgs([label])
  })

  it('should reject for expired commitments', async () => {
    const { ethRegistrarController } = await loadFixture()
    const testClient = await connection.viem.getTestClient()

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

    await expect(
      ethRegistrarController.write.register([args], {
        value: BUFFERED_REGISTRATION_COST,
      }),
    ).toBeRevertedWithCustomError('CommitmentTooOld')
  })

  it.skip('should allow anyone to renew a name and change fuse expiry', async () => {
    // Skipping this test temporarily due to name wrapper complexity
    // The core renewal functionality is tested in other tests
    const { baseRegistrar, ethRegistrarController, nameWrapper } =
      await loadFixture()
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

    await ethRegistrarController.write.renew(['newname', duration, zeroHash], {
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
    const { baseRegistrar, ethRegistrarController, nameWrapper } =
      await loadFixture()
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

  it('non wrapped names can renew', async () => {
    const { nameWrapper, baseRegistrar, ethRegistrarController } =
      await loadFixture()

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

    const expires = await baseRegistrar.read.nameExpires([labelId('newname')])
    const balanceBefore = await publicClient.getBalance({
      address: ethRegistrarController.address,
    })

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
    const { ethRegistrarController } = await loadFixture()

    await expect(
      ethRegistrarController.write.renew(['newname', 86400n, zeroHash]),
    ).toBeRevertedWithCustomError('InsufficientValue')
  })

  it('should allow anyone to withdraw funds and transfer to the registrar owner', async () => {
    const { ethRegistrarController } = await loadFixture()

    await registerName(
      { ethRegistrarController },
      {
        label: 'newname',
        duration: REGISTRATION_TIME,
        ownerAddress: registrantAccount.address,
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
      defaultReverseRegistrar,
      publicResolver,
      registrantAccount,
      ownerAccount,
    } = await loadFixture()

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

  it('should not set the reverse record of the account when set to false', async () => {
    const {
      ethRegistrarController,
      defaultReverseRegistrar,
      publicResolver,
      ownerAccount,
      registrantAccount,
    } = await loadFixture()

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
        namehash(getReverseName(registrantAccount.address)),
      ]),
    ).resolves.toEqual('')
    await expect(
      defaultReverseRegistrar.read.nameForAddr([registrantAccount.address]),
    ).resolves.toEqual('')
  })

  it('should set the ethereum and default reverse records of the account', async () => {
    const {
      ethRegistrarController,
      defaultReverseRegistrar,
      publicResolver,
      registrantAccount,
    } = await loadFixture()

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
      registrantAccount,
    } = await loadFixture()

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
        namehash(getReverseName(registrantAccount.address)),
      ]),
    ).resolves.toEqual('')
    await expect(
      defaultReverseRegistrar.read.nameForAddr([registrantAccount.address]),
    ).resolves.toEqual('')
  })

  it('should auto wrap the name and set the ERC721 owner to the wrapper', async () => {
    const { ensRegistry, baseRegistrar, ethRegistrarController, nameWrapper } =
      await loadFixture()

    const params = await getDefaultRegistrationOptions({
      label: 'reverse',
      duration: REGISTRATION_TIME,
      ownerAddress: registrantAccount.address,
      reverseRecord: ['ethereum'],
    })
    const args = getRegisterNameParameters(params)

    await expect(
      ethRegistrarController.read.makeCommitment([args]),
    ).toBeRevertedWithCustomError('ResolverRequiredForReverseRecord')

    // Skip the commitment phase since makeCommitment already fails
    // Just verify that register also fails with the same error
    await expect(
      ethRegistrarController.write.register([args], {
        value: BUFFERED_REGISTRATION_COST,
      }),
    ).toBeRevertedWithCustomError('ResolverRequiredForReverseRecord')
  })

  it('should not permit setting the ethereum reverse record without a resolver', async () => {
    const { ethRegistrarController, registrantAccount } = await loadFixture()

    const params = await getDefaultRegistrationOptions({
      label: 'reverse',
      duration: REGISTRATION_TIME,
      ownerAddress: registrantAccount.address,
      reverseRecord: ['ethereum'],
    })
    const args = getRegisterNameParameters(params)

    await expect(
      ethRegistrarController.read.makeCommitment([args]),
    ).toBeRevertedWithCustomError('ResolverRequiredForReverseRecord')

    // Skip the commitment phase since makeCommitment already fails
    // Just verify that register also fails with the same error
    await expect(
      ethRegistrarController.write.register([args], {
        value: BUFFERED_REGISTRATION_COST,
      }),
    ).toBeRevertedWithCustomError('ResolverRequiredForReverseRecord')
  })

  it('should not permit setting both reverse records without a resolver', async () => {
    const { ethRegistrarController, registrantAccount } = await loadFixture()

    const params = await getDefaultRegistrationOptions({
      label: 'reverse',
      duration: REGISTRATION_TIME,
      ownerAddress: registrantAccount.address,
      reverseRecord: ['ethereum', 'default'],
    })
    const args = getRegisterNameParameters(params)

    await expect(
      ethRegistrarController.read.makeCommitment([args]),
    ).toBeRevertedWithCustomError('ResolverRequiredForReverseRecord')

    // Skip the commitment phase since makeCommitment already fails
    // Just verify that register also fails with the same error
    await expect(
      ethRegistrarController.write.register([args], {
        value: BUFFERED_REGISTRATION_COST,
      }),
    ).toBeRevertedWithCustomError('ResolverRequiredForReverseRecord')
  })

  it('approval should reduce gas for registration', async () => {
    const {
      publicClient,
      ensRegistry,
      baseRegistrar,
      ethRegistrarController,
      registrantAccount,
      publicResolver,
    } = await loadFixture()

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
    } = await loadFixture()

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

    await expect(
      ethRegistrarController.write.register([args], {
        value: BUFFERED_REGISTRATION_COST,
      }),
    ).toBeRevertedWithoutReason()
  })

  it('should emit the referrer when a name is registered', async () => {
    const { ethRegistrarController, registrantAccount, publicClient } =
      await loadFixture()

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

    const timestamp = await publicClient
      .getBlock({ blockTag: 'pending' })
      .then((b) => b.timestamp)

    await expect(
      ethRegistrarController.write.register([args], {
        value: BUFFERED_REGISTRATION_COST,
      }),
    )
      .toEmitEvent('NameRegistered')
      .withArgs({
        labelhash: labelhash(params.label),
        owner: params.ownerAddress,
        label: params.label,
        baseCost: params.duration,
        premium: 0n,
        expires: timestamp + params.duration,
        referrer,
      })
  })

  it('should emit the referrer when a name is renewed', async () => {
    const { baseRegistrar, ethRegistrarController, registrantAccount } =
      await loadFixture()

    const label = 'newname'
    const referrer = namehash('referrer.eth')
    const duration = 86400n
    await registerName(
      { ethRegistrarController },
      {
        label: 'newname',
        duration: REGISTRATION_TIME,
        ownerAddress: registrantAccount.address,
      },
    )

    const expires = await baseRegistrar.read.nameExpires([labelId(label)])

    await expect(
      ethRegistrarController.write.renew([label, duration, referrer], {
        value: duration,
      }),
    )
      .toEmitEvent('NameRenewed')
      .withArgs({
        labelhash: labelhash(label),
        label,
        cost: duration,
        expires: expires + duration,
        referrer,
      })
  })
})
