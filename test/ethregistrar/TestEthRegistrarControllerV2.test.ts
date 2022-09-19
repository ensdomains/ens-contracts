import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import {
  BaseRegistrarImplementation,
  ENSRegistry,
  ETHRegistrarControllerV2,
  NameWrapper,
  PublicResolver,
  ReverseRegistrar,
  StablePriceOracle,
} from '../../typechain-types'
import { ethers } from 'hardhat'
import { expect } from 'chai'
import { namehash } from 'ethers/lib/utils'
import { describe } from 'mocha'
import { BigNumber } from 'ethers'
import names1000 from './names-1000.json'

const {
  evm,
  reverse: { getReverseNode },
  contracts: { deploy },
} = require('../test-utils')

const provider = ethers.provider
const sha3 = require('web3-utils').sha3

const DAYS = 24 * 60 * 60 // 86,400
const REGISTRATION_TIME = 28 * DAYS // 2,419,200
const BUFFERED_REGISTRATION_COST = 3 * DAYS // 259,200
const EMPTY_BYTES =
  '0x0000000000000000000000000000000000000000000000000000000000000000'

describe('ETHRegistrarControllerV2', () => {
  let ens: ENSRegistry
  let resolver: PublicResolver
  let resolver2: PublicResolver // resolver signed by registrant1Account
  let baseRegistrar: BaseRegistrarImplementation
  let controller: ETHRegistrarControllerV2
  let controller2: ETHRegistrarControllerV2 // controller signed by registrant1Account
  let priceOracle: StablePriceOracle
  let reverseRegistrar: ReverseRegistrar
  let nameWrapper: NameWrapper

  let result: any

  const secret =
    '0x0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF'

  let ownerAccount: SignerWithAddress // Account that owns the registrar
  let registrant1Account: SignerWithAddress // Account that owns test names
  let registrant2Account: SignerWithAddress // Account that owns test names
  let referrerAccount: SignerWithAddress // Account that refer test names

  interface Commit {
    creator?: any
    referrer?: any
    secret?: any
    tip?: number
    name: string[]
    owner?: any[]
    duration?: number[]
    resolver?: any[]
    data?: any[]
    reverseRecord?: boolean[]
    fuses?: number[]
    wrapperExpiry?: bigint[]
    txOptions?: any
  }
  interface RegistrationBatch {
    referrer: any
    creator: any
    secret: any
    tip: number
    registrations: Registration[]
  }
  interface Registration {
    name: string
    owner: any
    duration: number
    resolver: any
    data: any[]
    reverseRecord: boolean
    fuses: number
    wrapperExpiry: bigint
  }

  async function registerInterface(opts: Commit) {
    const batchPrice = { value: 0 }

    const registrationBatch: RegistrationBatch = {
      referrer: opts.referrer ? opts.referrer : referrerAccount.address,
      creator: opts.creator ? opts.creator : registrant1Account.address,
      secret: opts.secret ? opts.secret : secret,
      tip: opts.tip ? opts.tip : 0,
      registrations: [],
    }

    for (let i = 0; i < opts.name.length; i++) {
      const registrations: Registration = {
        name: opts.name[i],
        owner: opts.owner ? opts.owner[i] : registrant1Account.address,
        duration: opts.duration ? opts.duration[i] : REGISTRATION_TIME,
        resolver: opts.resolver ? opts.resolver[i] : ethers.constants.AddressZero,
        data: opts.data ? opts.data[i] : [],
        reverseRecord: opts.reverseRecord ? opts.reverseRecord[i] : false,
        fuses: opts.fuses ? opts.fuses[i] : 0,
        wrapperExpiry: opts.wrapperExpiry ? opts.wrapperExpiry[i] : BigInt(0),
      }
      registrationBatch.registrations.push(registrations)
      const [price] = await controller.rentPrice(
        registrationBatch.registrations[i].name,
        sha3(registrationBatch.registrations[i].name),
        registrationBatch.registrations[i].duration,
      )
      batchPrice.value += price.toNumber()
    }

    batchPrice.value += BUFFERED_REGISTRATION_COST
    return { registrationBatch, batchPrice }
  }

  async function registerName(opts: Commit) {
    const txOptions = opts.txOptions
    opts.txOptions = {}
    const { registrationBatch, batchPrice } = await makeCommitmentAndCommit(opts)
    const tx = await controller2.register(
      registrationBatch,
      txOptions ? txOptions : batchPrice,
    )
    return tx
  }

  async function makeCommitmentAndCommit(opts: Commit) {
    const { registrationBatch, batchPrice } = await registerInterface(opts)

    const commitment = await controller2.makeCommitment(registrationBatch)
    const txCommit = await controller2.commit(
      commitment,
      opts.txOptions ? opts.txOptions : { value: 0 },
    )
    expect(await controller.commitments(commitment)).to.equal(
      (await provider.getBlock(txCommit.blockHash!)).timestamp,
    )
    await evm.advanceTime((await controller.minCommitmentAge()).toNumber())

    return { commitment, txCommit, registrationBatch, batchPrice }
  }

  before(async () => {
    ;[ownerAccount, registrant1Account, registrant2Account, referrerAccount] =
      await ethers.getSigners()

    ens = await deploy('ENSRegistry')

    baseRegistrar = await deploy(
      'BaseRegistrarImplementation',
      ens.address,
      namehash('eth'),
    )

    nameWrapper = await deploy(
      'NameWrapper',
      ens.address,
      baseRegistrar.address,
      ownerAccount.address,
    )

    reverseRegistrar = await deploy('ReverseRegistrar', ens.address)

    await ens.setSubnodeOwner(EMPTY_BYTES, sha3('eth'), baseRegistrar.address)

    const dummyOracle = await deploy('DummyOracle', '100000000')
    priceOracle = await deploy(
      'StablePriceOracle',
      dummyOracle.address,
      [0, 0, 4, 2, 1],
    )
    controller = await deploy(
      'ETHRegistrarControllerV2',
      baseRegistrar.address,
      priceOracle.address,
      600,
      86400,
      reverseRegistrar.address,
      nameWrapper.address,
    )

    controller2 = controller.connect(registrant1Account)
    await baseRegistrar.addController(controller.address)
    await nameWrapper.setController(controller.address, true)
    await baseRegistrar.addController(nameWrapper.address)
    await reverseRegistrar.setController(controller.address, true)

    resolver = await deploy(
      'PublicResolver',
      ens.address,
      nameWrapper.address,
      controller.address,
      reverseRegistrar.address,
    )

    resolver2 = await resolver.connect(registrant1Account)

    await ens.setSubnodeOwner(
      EMPTY_BYTES,
      sha3('reverse'),
      ownerAccount.address,
      {
        from: ownerAccount.address,
      },
    )
    await ens.setSubnodeOwner(
      namehash('reverse'),
      sha3('addr'),
      reverseRegistrar.address,
      { from: ownerAccount.address },
    )
  })

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

  beforeEach(async () => {
    result = await ethers.provider.send('evm_snapshot', [])
  })
  afterEach(async () => {
    await ethers.provider.send('evm_revert', [result])
  })

  // it('GAS TEST: Reveal, 10 names one at a time, paying at reveal', async () => {
  //   let aggregatedGas = 0
  //   for(let i = 0; i < 10; i++){
  //     const tx = await registerName({ name: [(names1000[i].name).toString()] })
  //     const receipt = await tx.wait()
  //     aggregatedGas += (receipt.gasUsed).toNumber()
  //     console.log("Registering name %s using %s gas", names1000[i].name, aggregatedGas)
  //   }
  // })

  // it('GAS TEST: Reveal and Renew, batch of 190 names, paying at reveal', async () => {
  //   const names = []
  //   let aggregatedPrice = 0
  //   for(let i = 0; i < 190; i++){
  //     const name = (names1000[i].name).toString()
  //     const [price] = await controller.rentPrice(name,sha3(name),86400)
  //     names.push(name)
  //     aggregatedPrice += price.toNumber()
  //   }

  //   const tx = await registerName({ name: names })
  //   const receipt = await tx.wait()
  //   console.log("Gas used for Reveal: ",(receipt.gasUsed).toNumber())

  //   const txRenew = await controller.renew(
  //     names,
  //     86400,
  //     referrerAccount.address,
  //     { value: aggregatedPrice }
  //   )

  //   const receiptRenew = await txRenew.wait()
  //   console.log("Gas used for Renew: ",(receiptRenew.gasUsed).toNumber())
  // }).timeout(10000000)

  // it('GAS TEST: Reveal and Renew, batch combinations from 1 to 25, paying at reveal', async () => {
  //   const gasUsedForRegister = []
  //   const gasUsedForRenew = []
  //   let aggregatedPrice = 0
  //   let t = names1000.length
  //   for(let k = 1; k < 26; k++){
  //     const names = []
  //     for(let i = 0; i < k; i++, t--){
  //       const name = (names1000[t-1].name).toString()
  //       const [price] = await controller.rentPrice(name,sha3(name),86400)
  //       aggregatedPrice += price.toNumber()        
  //       names.push(name)      
  //     }

  //     const tx = await registerName({ name: names })
  //     const receipt = await tx.wait()
  //     console.log((receipt.gasUsed).toNumber())
  //     gasUsedForRegister.push((receipt.gasUsed).toNumber())  
  //     const txRenew = await controller.renew(
  //       names,
  //       86400,
  //       referrerAccount.address,
  //       { value: aggregatedPrice }
  //       )      
  //       const receiptRenew = await txRenew.wait()
  //       gasUsedForRenew.push((receiptRenew.gasUsed).toNumber())       
  //   }

  //   console.log("Gas used for Reveal: ",gasUsedForRegister)
  //   console.log("Gas used for Renew:  ",gasUsedForRenew)    
  // }).timeout(10000000)

  it('Should report unused names as available', async () => {
    const label = 'available'
    expect(await controller.available(label, sha3(label))).to.equal(true)
  })

  it('Should report registered names as unavailable', async () => {
    const names = ['newconfigname']
    await registerName({ name: names })
    expect(await controller.available(names[0], sha3(names[0]))).to.equal(false)
  })

  it('Should report different name prices for different lenghts', async () => {
    const names = ['new', 'name', 'names']
    for (let i = 0; i < names.length - 1; i++) {
      const [price] = await controller.rentPrice(
        names[i],
        sha3(names[i]),
        REGISTRATION_TIME,
      )
      const [priceNext] = await controller.rentPrice(
        names[i + 1],
        sha3(names[i + 1]),
        REGISTRATION_TIME,
      )
      expect(price.toNumber()).to.be.greaterThan(priceNext.toNumber())
    }
  })

  it('Should allow anyone to renew a name', async () => {
    const names = ['newname']
    await registerName({
      name: names,
    })
    const balanceBefore = await provider.getBalance(await controller.owner())
    const expires = await baseRegistrar.nameExpires(sha3(names[0]))

    const duration = 86400
    const [price] = await controller.rentPrice(
      names[0],
      sha3(names[0]),
      duration,
    )
    await controller.renew(names, duration, ethers.constants.AddressZero, {
      value: price,
    })
    let balanceAfter = await provider.getBalance(await controller.owner())

    const newExpires = await baseRegistrar.nameExpires(sha3(names[0]))
    expect(newExpires.toNumber() - expires.toNumber()).to.equal(86400)
    expect(balanceBefore).to.not.equal(balanceAfter)
  })

  it('Should allow anyone to renew a name with referral fee', async () => {
    const names = ['newname']
    await registerName({
      name: names,
    })
    const balanceBefore = await provider.getBalance(referrerAccount.address)
    const expires = await baseRegistrar.nameExpires(sha3(names[0]))

    const duration = 86400
    const [price] = await controller.rentPrice(
      names[0],
      sha3(names[0]),
      duration,
    )
    await controller2.renew(names, duration, referrerAccount.address, {
      value: price,
    })

    const newExpires = await baseRegistrar.nameExpires(sha3(names[0]))
    expect(newExpires.toNumber() - expires.toNumber()).to.equal(86400)

    const balanceAfter = await provider.getBalance(referrerAccount.address)
    expect(balanceBefore).to.not.equal(balanceAfter)

    const referralFee = (await controller.referralFee()).toNumber()
    const expectedReferralValue =
      Math.floor(price.toNumber() / 1000) * referralFee
    expect(balanceAfter.sub(balanceBefore)).to.equal(expectedReferralValue)
  })

  it('Should allow anyone to renew batches of names', async () => {
    const names = ['100100', '200200', '300300', '400400', '500500', '600600', '700700']
    const duration = 86400
    let batchPrice = 0

    await registerName({
      name: names,
    })

    for (let i = 0; i < names.length; i++) {
      const [price] = await controller.rentPrice(
        names[i],
        sha3(names[i]),
        duration,
      )
      batchPrice += price.toNumber()
    }
    const tx = await controller2.renew(
      names,
      duration,
      ethers.constants.AddressZero,
      { value: batchPrice }
    )
    for (let i = 0; i < names.length; i++) {
      const [price] = await controller.rentPrice(
        names[i],
        sha3(names[i]),
        duration,
      )

      const expires = await baseRegistrar.nameExpires(sha3(names[i]))
      await expect(tx)
        .to.emit(controller, 'NameRenewed')
        .withArgs(
          names[i],
          sha3(names[i]),
          price.toNumber(),
          expires.toNumber(),
          ethers.constants.AddressZero
        )
    }
  })

  it('Should permit batches of names', async () => {
    const names = ['new', 'name', 'ironman', 'hulk']
    const tx = await registerName({ name: names })
    const block = await provider.getBlock(tx.blockNumber!)
    for (let i = 0; i < names.length; i++) {
      const [price] = await controller.rentPrice(
        names[i],
        sha3(names[i]),
        REGISTRATION_TIME,
      )
      await expect(tx)
        .to.emit(controller, 'NameRegistered')
        .withArgs(
          names[i],
          sha3(names[i]),
          registrant1Account.address,
          price.toNumber(),
          0,
          block.timestamp + REGISTRATION_TIME,
        )
    }
  })

  it('Should permit batches of names with different owners, duration and reverseRecords', async () => {
    const names = ['Loki', 'Thor']
    const owner = [registrant1Account.address, registrant2Account.address]
    const duration = [REGISTRATION_TIME, REGISTRATION_TIME * 2]
    const tx = await registerName({
      name: names,
      owner: owner,
      duration: duration,
      resolver: [ethers.constants.AddressZero, resolver.address],
      reverseRecord: [false, true],
    })

    const block = await provider.getBlock(tx.blockNumber!)
    for (let i = 0; i < names.length; i++) {
      const [price] = await controller.rentPrice(
        names[i],
        sha3(names[i]),
        duration[i],
      )
      await expect(tx)
        .to.emit(controller, 'NameRegistered')
        .withArgs(
          names[i],
          sha3(names[i]),
          owner[i],
          price.toNumber(),
          0,
          block.timestamp + duration[i],
        )
    }
  })

  it('Should commit with payment and reveal the names for transaction cost only', async () => {
    const names = ['newname']
    const [price] = await controller.rentPrice(
      names[0],
      sha3(names[0]),
      REGISTRATION_TIME,
    )
    const { commitment, txCommit, registrationBatch } =
      await makeCommitmentAndCommit({
        name: names,
        tip: price.toNumber(),
        txOptions: { value: price.toNumber() },
      })
    expect(
      (await controller.tips(txCommit.from, commitment)).toNumber(),
    ).to.be.equal(price)

    const tx = await controller2.register(registrationBatch, { value: 0 })
    const block = await provider.getBlock(tx.blockNumber!)
    await expect(tx)
      .to.emit(controller, 'NameRegistered')
      .withArgs(
        names[0],
        sha3(names[0]),
        registrant1Account.address,
        price.toNumber(),
        0,
        block.timestamp + REGISTRATION_TIME,
      )
  })

  it('Should commit with payment, anyone can reveal', async () => {
    const balanceBefore = await provider.getBalance(await controller.owner())
    const names = ['newname']
    const [price] = await controller.rentPrice(
      names[0],
      sha3(names[0]),
      REGISTRATION_TIME,
    )
    const { commitment, txCommit, registrationBatch } =
      await makeCommitmentAndCommit({
        name: names,
        tip: price.toNumber(),
        txOptions: { value: price.toNumber() },
      })

    expect(
      (await controller.tips(txCommit.from, commitment)).toNumber(),
    ).to.be.equal(price)
    const tx = await controller.register(registrationBatch)
    expect(
      (await controller.tips(txCommit.from, commitment)).toNumber(),
    ).to.be.equal(0)

    const block = await provider.getBlock(tx.blockNumber!)
    await expect(tx)
      .to.emit(controller, 'NameRegistered')
      .withArgs(
        names[0],
        sha3(names[0]),
        registrationBatch.registrations[0].owner,
        price.toNumber(),
        0,
        block.timestamp + REGISTRATION_TIME,
      )

    const balanceAfter = await provider.getBalance(await controller.owner())

    expect(balanceAfter).to.not.equal(balanceBefore)
  })

  it('Should commit with payment and at reveal, preferring to use tip, returning the eth', async () => {
    const balanceBeforeOwner = await provider.getBalance(await controller.owner())
    const names = ['newname']
    const [price] = await controller.rentPrice(
      names[0],
      sha3(names[0]),
      REGISTRATION_TIME,
    )

    const { commitment, txCommit, registrationBatch } =
      await makeCommitmentAndCommit({
        name: names,
        tip: price.toNumber(),
        txOptions: { value: price.toNumber() },
      })

    const balanceBeforeReg1 = await provider.getBalance(registrant1Account.address)
    expect((await controller.tips(txCommit.from, commitment)).toNumber(),).to.be.equal(price)
    const tx = await controller2.register(registrationBatch, { value: price })

    const balanceAfterReg1 = await provider.getBalance(registrant1Account.address)
    expect((await controller.tips(txCommit.from, commitment)).toNumber(),).to.be.equal(0)
    expect(balanceAfterReg1).to.not.equal(balanceBeforeReg1)

    const block = await provider.getBlock(tx.blockNumber!)
    await expect(tx)
      .to.emit(controller, 'NameRegistered')
      .withArgs(
        names[0],
        sha3(names[0]),
        registrationBatch.registrations[0].owner,
        price.toNumber(),
        0,
        block.timestamp + REGISTRATION_TIME,
      )

    const balanceAfterOwner = await provider.getBalance(await controller.owner())

    expect(balanceAfterOwner).to.not.equal(balanceBeforeOwner)
  })

  it('Should commit and reveal, with 0 eth, reverting', async () => {
    const names = ['newname']
    const { commitment, txCommit, registrationBatch } =
      await makeCommitmentAndCommit({
        name: names,
        tip: 0,
        txOptions: { value: 0 },
      })
    expect(
      (await controller.tips(txCommit.from, commitment)).toNumber(),
    ).to.be.equal(0)
    await expect(
      controller2.register(registrationBatch, { value: 0 }),
    ).to.be.revertedWith('ETHRegistrarControllerV2: Not enough ether provided')
  })

  it('Should permit new registrations', async () => {
    const names = ['newname']
    const tx = await registerName({
      name: names,
      txOptions: { value: REGISTRATION_TIME }
    })
    const block = await provider.getBlock(tx.blockNumber!)
    await expect(tx)
      .to.emit(controller, 'NameRegistered')
      .withArgs(
        names[0],
        sha3(names[0]),
        registrant1Account.address,
        REGISTRATION_TIME,
        0,
        block.timestamp + REGISTRATION_TIME,
      )
    const receipt = await tx.wait()
    console.log(receipt.gasUsed)
  })

  it('Should permit new registration with referral, sending eth to referrer', async () => {
    const names = ['newconfigname']
    const balanceBefore = await provider.getBalance(referrerAccount.address)
    await registerName({
      name: names,
      referrer: referrerAccount.address,
    })
    const balanceAfter = await provider.getBalance(referrerAccount.address)

    expect(balanceBefore).to.not.equal(balanceAfter)
  })

  it('Should permit new registrations with resolver and records', async () => {
    const balanceBefore = await provider.getBalance(await controller.owner())
    const names = ['newconfigname']
    const { registrationBatch, batchPrice } = await registerInterface({
      name: names,
      resolver: [resolver.address],
      data: [
        [
          resolver.interface.encodeFunctionData('setAddr(bytes32,address)', [
            namehash('newconfigname.eth'),
            registrant1Account.address,
          ]),
          resolver.interface.encodeFunctionData('setText', [
            namehash('newconfigname.eth'),
            'url',
            'ethereum.com',
          ]),
        ],
      ],
    })

    const commitment = await controller2.makeCommitment(registrationBatch)
    await controller2.commit(commitment)
    await evm.advanceTime((await controller.minCommitmentAge()).toNumber())
    const tx = await controller2.register(registrationBatch, batchPrice)

    const block = await provider.getBlock(tx.blockNumber!)
    for (let i = 0; i < names.length; i++) {
      await expect(tx)
        .to.emit(controller, 'NameRegistered')
        .withArgs(
          names[i],
          sha3(names[i]),
          registrant1Account.address,
          REGISTRATION_TIME,
          0,
          block.timestamp + REGISTRATION_TIME,
        )
    }

    const balanceAfter = await provider.getBalance(await controller.owner())
    expect(balanceBefore).to.not.equal(balanceAfter)

    const nodehash = namehash('newconfigname.eth')
    expect(await ens.resolver(nodehash)).to.equal(resolver.address)
    expect(await ens.owner(nodehash)).to.equal(nameWrapper.address)
    expect(await baseRegistrar.ownerOf(sha3('newconfigname'))).to.equal(
      nameWrapper.address,
    )
    expect(await resolver['addr(bytes32)'](nodehash)).to.equal(
      registrant1Account.address,
    )
    expect(await resolver['text'](nodehash, 'url')).to.equal('ethereum.com')
    expect(await nameWrapper.ownerOf(nodehash)).to.equal(
      registrant1Account.address,
    )
  })

  it('Should permit new registrations with resolver but no records', async () => {
    const balanceBefore = await provider.getBalance(await controller.owner())
    const names = ['newconfigname']
    const { registrationBatch, batchPrice } = await registerInterface({
      name: names,
      resolver: [resolver.address],
    })

    const commitment = await controller2.makeCommitment(registrationBatch)
    await controller2.commit(commitment)
    await evm.advanceTime((await controller.minCommitmentAge()).toNumber())
    const tx = await controller2.register(registrationBatch, batchPrice)

    const block = await provider.getBlock(tx.blockNumber!)
    for (let i = 0; i < names.length; i++) {
      await expect(tx)
        .to.emit(controller, 'NameRegistered')
        .withArgs(
          names[i],
          sha3(names[i]),
          registrant1Account.address,
          REGISTRATION_TIME,
          0,
          block.timestamp + REGISTRATION_TIME,
        )
    }

    const balanceAfter = await provider.getBalance(await controller.owner())
    expect(balanceBefore).to.not.equal(balanceAfter)

    const nodehash = namehash('newconfigname.eth')
    expect(await ens.resolver(nodehash)).to.equal(resolver.address)
    expect(await resolver['addr(bytes32)'](nodehash)).to.equal(
      ethers.constants.AddressZero,
    )
  })

  it('Should not permit registrations when not enough ether is transferred', async () => {
    const names = ['newconfigname']
    await expect(
      registerName({ name: names, txOptions: { value: 0 } }),
    ).to.be.revertedWith('ETHRegistrarControllerV2: Not enough ether provided')
  })

  it('Should not permit new registrations to zero address', async () => {
    const names = ['newconfigname']
    await expect(
      registerName({
        name: names,
        owner: [ethers.constants.AddressZero],
      }),
    ).to.be.revertedWith('ERC1155: mint to the zero address')
  })

  it('Should not permit new registrations with duplicated names', async () => {
    const names = ['newconfigname']
    await registerName({
      name: names,
    })
    await expect(registerName({ name: names })).to.be.reverted
  })

  it('Should not permit new registrations for expired commitments', async () => {
    const names = ['newname']
    const { registrationBatch } = await registerInterface({
      name: names,
      owner: [registrant1Account.address],
      resolver: [resolver.address],
    })

    await controller.commit(await controller.makeCommitment(registrationBatch))
    await evm.advanceTime((await controller.maxCommitmentAge()).toNumber() + 1)
    expect(controller2.register(registrationBatch)).to.be.revertedWith(
      'ETHRegistrarControllerV2: Commitment has expired',
    )
  })

  it('Should not permit new registrations with 0 resolver', async () => {
    const names = ['newconfigname']
    await expect(
      registerName({
        name: names,
        resolver: [ethers.constants.AddressZero],
        data: [
          [
            resolver.interface.encodeFunctionData('setAddr(bytes32,address)', [
              namehash('newconfigname.eth'),
              registrant1Account.address,
            ]),
            resolver.interface.encodeFunctionData('setText', [
              namehash('newconfigname.eth'),
              'url',
              'ethereum.com',
            ]),
          ],
        ],
      }),
    ).to.be.revertedWith(
      'ETHRegistrarControllerV2: resolver is required when data is supplied',
    )
  })

  it('Should not permit new registrations with EoA resolver', async () => {
    const names = ['newconfigname']
    await expect(
      registerName({
        name: names,
        resolver: [registrant1Account.address],
        data: [
          [
            resolver.interface.encodeFunctionData('setAddr(bytes32,address)', [
              namehash('newconfigname.eth'),
              registrant1Account.address,
            ]),
            resolver.interface.encodeFunctionData('setText', [
              namehash('newconfigname.eth'),
              'url',
              'ethereum.com',
            ]),
          ],
        ],
      }),
    ).to.be.revertedWith('Address: call to non-contract')
  })

  it('Should not permit new registrations with an incompatible contract', async () => {
    const names = ['newconfigname']
    await expect(
      registerName({
        name: names,
        resolver: [controller.address],
        data: [
          [
            resolver.interface.encodeFunctionData('setAddr(bytes32,address)', [
              namehash('newconfigname.eth'),
              registrant1Account.address,
            ]),
            resolver.interface.encodeFunctionData('setText', [
              namehash('newconfigname.eth'),
              'url',
              'ethereum.com',
            ]),
          ],
        ],
      }),
    ).to.be.revertedWith('ETHRegistrarControllerV2: Failed to set Record')
  })

  it('Should not permit new registrations with records updating a different name', async () => {
    const names = ['newconfigname']
    await expect(
      registerName({
        name: names,
        resolver: [resolver.address],
        data: [
          [
            resolver.interface.encodeFunctionData('setAddr(bytes32,address)', [
              namehash('othername.eth'),
              registrant1Account.address,
            ]),
          ],
        ],
      }),
    ).to.be.revertedWith(
      'ETHRegistrarControllerV2: Namehash on record do not match the name being registered',
    )
  })

  it('Should not permit new registrations with any record updating a different name', async () => {
    const names = ['newconfigname']
    await expect(
      registerName({
        name: names,
        resolver: [resolver.address],
        data: [
          [
            resolver.interface.encodeFunctionData('setAddr(bytes32,address)', [
              namehash('newconfigname.eth'),
              registrant1Account.address,
            ]),
            resolver.interface.encodeFunctionData('setText', [
              namehash('other.eth'),
              'url',
              'ethereum.com',
            ]),
          ],
        ],
      }),
    ).to.be.revertedWith(
      'ETHRegistrarControllerV2: Namehash on record do not match the name being registered',
    )
  })

  it('Should not permit new registrations to be tampered with', async () => {
    const names = ['newname']
    const { registrationBatch, batchPrice } = await makeCommitmentAndCommit({
      name: names,
      owner: [registrant1Account.address],
      resolver: [resolver.address],
    })
    registrationBatch.registrations[0].owner = registrant2Account.address

    await expect(
      controller.register(registrationBatch, batchPrice),
    ).to.be.revertedWith(
      'ETHRegistrarControllerV2: Commitment has expired or not found',
    )
  })

  it('Should not permit renewal when not enough ether is transferred', async () => {
    const names = ['name']
    await registerName({ name: names })
    await expect(controller.renew(names, 86400, referrerAccount.address),
    ).to.be.revertedWith(
      'ETHRegistrarControllerV2: Not enough ether provided',
    )
  })

  it('Should not permit renewal when name is not registered', async () => {
    const names = ['name']
    const duration = 86400
    const [price] = await controller.rentPrice(
      names[0],
      sha3(names[0]),
      duration,
    )
    await expect(controller.renew(
      names,
      86400,
      referrerAccount.address,
      { value: price }
    ),
    ).to.be.reverted
  })

  it('Should set the reverse record of the account', async () => {
    const names = ['reverse']
    await registerName({
      name: names,
      resolver: [resolver.address],
      reverseRecord: [true],
    })
    expect(
      await resolver.name(getReverseNode(registrant1Account.address)),
    ).to.equal('reverse.eth')
  })

  it('Should not set the reverse record of the account when set to false', async () => {
    const names = ['reverse']
    await registerName({
      name: names,
      resolver: [resolver.address],
      reverseRecord: [false],
    })
    expect(await resolver.name(getReverseNode(ownerAccount.address))).to.equal(
      '',
    )
  })

  it('Should auto wrap the name and set the ERC721 owner to the wrapper', async () => {
    const label = 'wrapper'
    const name = label + '.eth'
    await registerName({
      name: [label],
      owner: [registrant1Account.address],
      resolver: [resolver.address],
      reverseRecord: [true],
    })

    expect(await nameWrapper.ownerOf(namehash(name))).to.equal(
      registrant1Account.address,
    )

    expect(await ens.owner(namehash(name))).to.equal(nameWrapper.address)
    expect(await baseRegistrar.ownerOf(sha3(label))).to.equal(
      nameWrapper.address,
    )
  })

  it('Should auto wrap the name and allow fuses and expiry to be set', async () => {
    const MAX_INT_64 = 2n ** 64n - 1n
    const label = 'fuses'
    const name = label + '.eth'
    const tx = await registerName({
      name: [label],
      resolver: [resolver.address],
      reverseRecord: [true],
      fuses: [1],
      wrapperExpiry: [MAX_INT_64],
    })

    const block = await provider.getBlock(tx.blockNumber!)

    const [, fuses, expiry] = await nameWrapper.getData(namehash(name))
    expect(fuses).to.equal(65)
    expect(expiry).to.equal(REGISTRATION_TIME + block.timestamp)
  })

  it('Should reduce gas for registration with approval', async () => {
    const label = 'newconfigname'
    const name = label + '.eth'
    const node = namehash(name)
    const { registrationBatch, batchPrice } = await registerInterface({
      name: [label],
      owner: [registrant1Account.address],
      duration: [REGISTRATION_TIME],
      resolver: [resolver.address],
      data: [
        [
          resolver.interface.encodeFunctionData('setAddr(bytes32,address)', [
            node,
            registrant1Account.address,
          ]),
        ],
      ],
      reverseRecord: [true],
      fuses: [1],
    })

    await controller.commit(await controller.makeCommitment(registrationBatch))

    await evm.advanceTime((await controller.minCommitmentAge()).toNumber())

    const gasA = await controller2.estimateGas.register(
      registrationBatch,
      batchPrice,
    )

    await resolver2.setApprovalForAll(controller.address, true)

    registrationBatch.registrations[0].resolver = resolver2.address

    const gasB = await controller2.estimateGas.register(
      registrationBatch,
      batchPrice,
    )

    const tx = await controller2.register(registrationBatch, batchPrice)

    expect(await nameWrapper.ownerOf(node)).to.equal(registrant1Account.address)
    expect(await ens.owner(namehash(name))).to.equal(nameWrapper.address)
    expect(await baseRegistrar.ownerOf(sha3(label))).to.equal(
      nameWrapper.address,
    )
    expect(await resolver2['addr(bytes32)'](node)).to.equal(
      registrant1Account.address,
    )
  })

  it('Should change the referral fee', async () => {
    const newFee = 100
    const feeBefore = await controller.referralFee()

    await controller.setReferralFee(newFee)

    const feeAfter = await controller.referralFee()
    expect(feeAfter).to.not.equal(feeBefore)
  })

  it('Should withdraw commitments', async () => {
    const names = ['newname']
    const [price] = await controller.rentPrice(
      names[0],
      sha3(names[0]),
      REGISTRATION_TIME,
    )
    const { commitment, txCommit } = await makeCommitmentAndCommit({
      name: names,
      tip: price.toNumber(),
      txOptions: { value: price.toNumber() },
    })

    expect(
      (await controller.tips(txCommit.from, commitment)).toNumber(),
    ).to.be.equal(price.toNumber())
    await controller2.withdraw(commitment)
    expect(
      (await controller.tips(txCommit.from, commitment)).toNumber(),
    ).to.be.equal(0)
  })

  it('Should withdraw expired commitments', async () => {
    const names = ['newname']
    const [price] = await controller.rentPrice(
      names[0],
      sha3(names[0]),
      REGISTRATION_TIME,
    )
    const { commitment, txCommit, registrationBatch } =
      await makeCommitmentAndCommit({
        name: names,
        tip: price.toNumber(),
        txOptions: { value: price.toNumber() },
      })

    expect(
      (await controller.tips(txCommit.from, commitment)).toNumber(),
    ).to.be.equal(price.toNumber())
    await evm.advanceTime(1000000000)
    await controller2.withdraw(commitment)
    expect(
      (await controller.tips(txCommit.from, commitment)).toNumber(),
    ).to.be.equal(0)
  })

  it('Should withdraw commitments before the reveal and reject to reveal even sending enough eth', async () => {
    const names = ['newname']
    const [price] = await controller.rentPrice(
      names[0],
      sha3(names[0]),
      REGISTRATION_TIME,
    )
    const { commitment, txCommit, registrationBatch } =
      await makeCommitmentAndCommit({
        name: names,
        tip: price.toNumber(),
        txOptions: { value: price.toNumber() },
      })

    expect(
      (await controller.tips(txCommit.from, commitment)).toNumber(),
    ).to.be.equal(price.toNumber())
    await controller2.withdraw(commitment)
    await expect(
      controller.register(registrationBatch, { value: price.toNumber() }),
    ).to.revertedWith('ETHRegistrarControllerV2: Tip doesnt match commit value')
  })

  it('Should not permit withdraw to another address', async () => {
    const names = ['newname']
    const [price] = await controller.rentPrice(names[0], sha3(names[0]), DAYS)
    const { commitment, txCommit } = await makeCommitmentAndCommit({
      name: names,
      tip: price.toNumber(),
      txOptions: { value: price.toNumber() },
    })
    expect(
      (await controller.tips(txCommit.from, commitment)).toNumber(),
    ).to.be.equal(price)
    await expect(controller.withdraw(commitment)).to.be.revertedWith(
      'ETHRegistrarControllerV2: No balance to withdraw',
    )
  })
})
