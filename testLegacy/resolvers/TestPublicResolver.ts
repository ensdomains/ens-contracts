import { shouldSupportInterfaces } from '@ensdomains/hardhat-chai-matchers-viem/behaviour'
import { loadFixture } from '@nomicfoundation/hardhat-toolbox-viem/network-helpers.js'
import { expect } from 'chai'
import hre from 'hardhat'
import {
  type Address,
  type Hash,
  type Hex,
  decodeFunctionResult,
  encodeFunctionData,
  keccak256,
  labelhash,
  namehash,
  padHex,
  zeroAddress,
  zeroHash,
} from 'viem'
import { createInterfaceId } from '../fixtures/createInterfaceId.js'
import { dnsEncodeName } from '../fixtures/dnsEncodeName.js'
import {
  COIN_TYPE_DEFAULT,
  COIN_TYPE_ETH,
  shortCoin,
} from '../fixtures/ensip19.js'

const targetNode = namehash('eth')

async function fixture() {
  const walletClients = await hre.viem.getWalletClients()
  const accounts = walletClients.map((c) => c.account)
  const ensRegistry = await hre.viem.deployContract('ENSRegistry', [])
  const nameWrapper = await hre.viem.deployContract('DummyNameWrapper', [])

  // setup reverse registrar
  const reverseRegistrar = await hre.viem.deployContract('ReverseRegistrar', [
    ensRegistry.address,
  ])

  await ensRegistry.write.setSubnodeOwner([
    zeroHash,
    labelhash('reverse'),
    accounts[0].address,
  ])
  await ensRegistry.write.setSubnodeOwner([
    namehash('reverse'),
    labelhash('addr'),
    reverseRegistrar.address,
  ])

  const publicResolver = await hre.viem.deployContract('PublicResolver', [
    ensRegistry.address,
    nameWrapper.address,
    accounts[9].address,
    reverseRegistrar.address,
  ])

  await reverseRegistrar.write.setDefaultResolver([publicResolver.address])

  await ensRegistry.write.setSubnodeOwner([
    zeroHash,
    labelhash('eth'),
    accounts[0].address,
  ])

  return {
    ensRegistry,
    nameWrapper,
    reverseRegistrar,
    publicResolver,
    walletClients,
    accounts,
  }
}

async function fixtureWithDnsRecords() {
  const existing = await loadFixture(fixture)
  // a.eth. 3600 IN A 1.2.3.4
  const arec = '016103657468000001000100000e10000401020304' as const
  // b.eth. 3600 IN A 2.3.4.5
  const b1rec = '016203657468000001000100000e10000402030405' as const
  // b.eth. 3600 IN A 3.4.5.6
  const b2rec = '016203657468000001000100000e10000403040506' as const
  // eth. 86400 IN SOA ns1.ethdns.xyz. hostmaster.test.eth. 2018061501 15620 1800 1814400 14400
  const soarec =
    '03657468000006000100015180003a036e733106657468646e730378797a000a686f73746d6173746572057465737431036574680078492cbd00003d0400000708001baf8000003840' as const
  const rec = `0x${arec}${b1rec}${b2rec}${soarec}` as const
  const hash = await existing.publicResolver.write.setDNSRecords([
    targetNode,
    rec,
  ])
  return { ...existing, rec, arec, b1rec, b2rec, soarec, hash }
}

describe('PublicResolver', () => {
  shouldSupportInterfaces({
    contract: () => loadFixture(fixture).then((F) => F.publicResolver),
    interfaces: [
      '@openzeppelin/contracts/utils/introspection/IERC165.sol:IERC165',
      'IAddrResolver',
      'IAddressResolver',
      'IHasAddressResolver',
      'INameResolver',
      'IABIResolver',
      'IPubkeyResolver',
      'ITextResolver',
      'IContentHashResolver',
      'IDNSRecordResolver',
      'IDNSZoneResolver',
      'IInterfaceResolver',
    ],
  })

  describe('fallback function', () => {
    it('forbids calls to the fallback function with 0 value', async () => {
      const { publicResolver, walletClients } = await loadFixture(fixture)

      await expect(publicResolver)
        .transaction(
          walletClients[0].sendTransaction({
            to: publicResolver.address,
            gas: 3000000n,
          }),
        )
        .toBeRevertedWithoutReason()
    })

    it('forbids calls to the fallback function with 1 value', async () => {
      const { publicResolver, walletClients } = await loadFixture(fixture)

      await expect(publicResolver)
        .transaction(
          walletClients[0].sendTransaction({
            to: publicResolver.address,
            value: 1n,
            gas: 3000000n,
          }),
        )
        .toBeRevertedWithoutReason()
    })
  })

  describe('recordVersion', () => {
    it('permits clearing records', async () => {
      const { publicResolver } = await loadFixture(fixture)

      await expect(publicResolver)
        .write('clearRecords', [targetNode])
        .toEmitEvent('VersionChanged')
        .withArgs(targetNode, 1n)
    })
  })

  describe('addr', () => {
    it('permits setting address by owner', async () => {
      const { publicResolver, accounts } = await loadFixture(fixture)

      const hash = await publicResolver.write.setAddr([
        targetNode,
        accounts[1].address,
      ])

      await expect(publicResolver)
        .transaction(hash)
        .toEmitEvent('AddressChanged')
        .withArgs(targetNode, COIN_TYPE_ETH, accounts[1].address)

      await expect(publicResolver)
        .transaction(hash)
        .toEmitEvent('AddrChanged')
        .withArgs(targetNode, accounts[1].address)

      await expect(
        publicResolver.read.addr([targetNode]) as Promise<Address>,
      ).resolves.toEqualAddress(accounts[1].address)
    })

    it('can overwrite previously set address', async () => {
      const { publicResolver, accounts } = await loadFixture(fixture)

      await publicResolver.write.setAddr([targetNode, accounts[1].address])
      await expect(
        publicResolver.read.addr([targetNode]) as Promise<Address>,
      ).resolves.toEqualAddress(accounts[1].address)

      await publicResolver.write.setAddr([targetNode, accounts[0].address])
      await expect(
        publicResolver.read.addr([targetNode]) as Promise<Address>,
      ).resolves.toEqualAddress(accounts[0].address)
    })

    it('can overwrite to same address', async () => {
      const { publicResolver, accounts } = await loadFixture(fixture)

      await publicResolver.write.setAddr([targetNode, accounts[1].address])
      await expect(
        publicResolver.read.addr([targetNode]) as Promise<Address>,
      ).resolves.toEqualAddress(accounts[1].address)

      await publicResolver.write.setAddr([targetNode, accounts[1].address])
      await expect(
        publicResolver.read.addr([targetNode]) as Promise<Address>,
      ).resolves.toEqualAddress(accounts[1].address)
    })

    it('forbids setting new address by non-owners', async () => {
      const { publicResolver, accounts } = await loadFixture(fixture)

      await expect(publicResolver)
        .write('setAddr', [targetNode, accounts[1].address], {
          account: accounts[1],
        })
        .toBeRevertedWithoutReason()
    })

    it('forbids writing same address by non-owners', async () => {
      const { publicResolver, accounts } = await loadFixture(fixture)

      await publicResolver.write.setAddr([targetNode, accounts[1].address])

      await expect(publicResolver)
        .write('setAddr', [targetNode, accounts[1].address], {
          account: accounts[1],
        })
        .toBeRevertedWithoutReason()
    })

    it('forbids overwriting existing address by non-owners', async () => {
      const { publicResolver, accounts } = await loadFixture(fixture)

      await publicResolver.write.setAddr([targetNode, accounts[1].address])

      await expect(publicResolver)
        .write('setAddr', [targetNode, accounts[0].address], {
          account: accounts[1],
        })
        .toBeRevertedWithoutReason()
    })

    it('returns zero when fetching nonexistent addresses', async () => {
      const { publicResolver } = await loadFixture(fixture)

      await expect(
        publicResolver.read.addr([targetNode]) as Promise<Address>,
      ).resolves.toEqualAddress(zeroAddress)
    })

    it('permits setting and retrieving addresses for other coin types', async () => {
      const { publicResolver, accounts } = await loadFixture(fixture)

      await publicResolver.write.setAddr([
        targetNode,
        123n,
        accounts[1].address,
      ])

      await expect(
        publicResolver.read.addr([targetNode, 123n]) as Promise<Hex>,
      ).resolves.toEqual(accounts[1].address.toLowerCase() as Address)
    })

    it('returns ETH address for coin type 60', async () => {
      const { publicResolver, accounts } = await loadFixture(fixture)

      const hash = await publicResolver.write.setAddr([
        targetNode,
        accounts[1].address,
      ])

      await expect(publicResolver)
        .transaction(hash)
        .toEmitEvent('AddressChanged')
        .withArgs(targetNode, COIN_TYPE_ETH, accounts[1].address)
      await expect(publicResolver)
        .transaction(hash)
        .toEmitEvent('AddrChanged')
        .withArgs(targetNode, accounts[1].address)
      await expect(
        publicResolver.read.addr([targetNode, COIN_TYPE_ETH]) as Promise<Hex>,
      ).resolves.toEqual(accounts[1].address.toLowerCase() as Address)
    })

    it('setting coin type 60 updates ETH address', async () => {
      const { publicResolver, accounts } = await loadFixture(fixture)

      const hash = await publicResolver.write.setAddr([
        targetNode,
        COIN_TYPE_ETH,
        accounts[2].address,
      ])

      await expect(publicResolver)
        .transaction(hash)
        .toEmitEvent('AddressChanged')
        .withArgs(targetNode, COIN_TYPE_ETH, accounts[2].address)
      await expect(publicResolver)
        .transaction(hash)
        .toEmitEvent('AddrChanged')
        .withArgs(targetNode, accounts[2].address)
      await expect(
        publicResolver.read.addr([targetNode]) as Promise<Address>,
      ).resolves.toEqualAddress(accounts[2].address)
    })

    it('resets record on version change', async () => {
      const { publicResolver, accounts } = await loadFixture(fixture)

      await publicResolver.write.setAddr([targetNode, accounts[1].address])

      await expect(
        publicResolver.read.addr([targetNode]) as Promise<Address>,
      ).resolves.toEqualAddress(accounts[1].address)

      await publicResolver.write.clearRecords([targetNode])

      await expect(
        publicResolver.read.addr([targetNode]) as Promise<Address>,
      ).resolves.toEqualAddress(zeroAddress)
    })

    it('clears address w/setAddr(60)', async () => {
      const { publicResolver, accounts } = await loadFixture(fixture)
      // set
      await publicResolver.write.setAddr([
        targetNode,
        COIN_TYPE_ETH,
        accounts[1].address,
      ])
      await expect(
        publicResolver.read.addr([targetNode]) as Promise<Address>,
        'confirm set',
      ).resolves.toEqualAddress(accounts[1].address)
      // clear
      await publicResolver.write.setAddr([targetNode, COIN_TYPE_ETH, '0x'])
      await expect(
        publicResolver.read.addr([targetNode]) as Promise<Address>,
        'addr',
      ).resolves.toEqualAddress(zeroAddress)
      await expect(
        publicResolver.read.addr([
          targetNode,
          COIN_TYPE_ETH,
        ]) as Promise<Address>,
        'addr(60)',
      ).resolves.toStrictEqual('0x')
    })

    it('zeros address w/setAddr()', async () => {
      const { publicResolver, accounts } = await loadFixture(fixture)
      // set
      await publicResolver.write.setAddr([targetNode, accounts[1].address])
      await expect(
        publicResolver.read.addr([targetNode]) as Promise<Address>,
        'confirm set',
      ).resolves.toEqualAddress(accounts[1].address)
      // clear
      await publicResolver.write.setAddr([targetNode, zeroAddress])
      await expect(
        publicResolver.read.addr([targetNode]) as Promise<Address>,
        'addr',
      ).resolves.toEqualAddress(zeroAddress)
      await expect(
        publicResolver.read.addr([
          targetNode,
          COIN_TYPE_ETH,
        ]) as Promise<Address>,
        'addr(60)',
      ).resolves.toStrictEqual(zeroAddress)
    })

    it('does fallback for EVM coin types to default', async () => {
      const { publicResolver, accounts } = await loadFixture(fixture)
      // set default
      await publicResolver.write.setAddr([
        targetNode,
        COIN_TYPE_DEFAULT,
        accounts[1].address,
      ])
      // expect evm are default
      for (const coinType of [COIN_TYPE_ETH, COIN_TYPE_DEFAULT | 1n]) {
        await expect(
          publicResolver.read.addr([targetNode, coinType]) as Promise<Address>,
          shortCoin(coinType),
        ).resolves.toEqualAddress(accounts[1].address)
      }
    })

    it('does not fallback for non-EVM coin types', async () => {
      const { publicResolver, accounts } = await loadFixture(fixture)
      // set default
      await publicResolver.write.setAddr([
        targetNode,
        COIN_TYPE_DEFAULT,
        accounts[1].address,
      ])
      // expect non-evm ignore default
      for (const coinType of [0n, 1n]) {
        await expect(
          publicResolver.read.addr([targetNode, coinType]) as Promise<Address>,
          shortCoin(coinType),
        ).resolves.toStrictEqual('0x')
      }
    })

    it('forbids setting an invalid EVM address', async () => {
      const invalidAddr = '0x1234'
      const { publicResolver } = await loadFixture(fixture)
      for (const coinType of [COIN_TYPE_ETH, COIN_TYPE_DEFAULT]) {
        await expect(publicResolver)
          .write('setAddr', [targetNode, coinType, invalidAddr])
          .toBeRevertedWithCustomError('InvalidEVMAddress')
          .withArgs(invalidAddr)
      }
    })

    it('allows address(0) to prevent fallback', async () => {
      const { publicResolver, accounts } = await loadFixture(fixture)
      // set explicit 0
      await publicResolver.write.setAddr([
        targetNode,
        COIN_TYPE_ETH,
        zeroAddress,
      ])
      // set default
      await publicResolver.write.setAddr([
        targetNode,
        COIN_TYPE_DEFAULT,
        accounts[1].address,
      ])
      // expect 0
      await expect(
        publicResolver.read.addr([
          targetNode,
          COIN_TYPE_ETH,
        ]) as Promise<Address>,
      ).resolves.toStrictEqual(zeroAddress)
    })

    it('supports hasAddr() even if addr() returns default', async () => {
      const { publicResolver, accounts } = await loadFixture(fixture)
      // set default
      await publicResolver.write.setAddr([
        targetNode,
        COIN_TYPE_DEFAULT,
        accounts[1].address,
      ])
      // has default
      await expect(
        publicResolver.read.hasAddr([targetNode, COIN_TYPE_DEFAULT]),
      ).resolves.toStrictEqual(true)
      // does not have any other
      for (const coinType of [0n, COIN_TYPE_ETH, COIN_TYPE_DEFAULT | 1n]) {
        await expect(
          publicResolver.read.hasAddr([targetNode, coinType]),
          shortCoin(coinType),
        ).resolves.toStrictEqual(false)
      }
    })
  })

  describe('name', () => {
    it('permits setting name by owner', async () => {
      const { publicResolver } = await loadFixture(fixture)

      await expect(publicResolver)
        .write('setName', [targetNode, 'name1'])
        .toEmitEvent('NameChanged')
        .withArgs(targetNode, 'name1')
      await expect(publicResolver.read.name([targetNode])).resolves.toEqual(
        'name1',
      )
    })

    it('can overwrite previously set names', async () => {
      const { publicResolver } = await loadFixture(fixture)

      await publicResolver.write.setName([targetNode, 'name1'])
      await expect(publicResolver.read.name([targetNode])).resolves.toEqual(
        'name1',
      )

      await publicResolver.write.setName([targetNode, 'name2'])
      await expect(publicResolver.read.name([targetNode])).resolves.toEqual(
        'name2',
      )
    })

    it('forbids setting name by non-owners', async () => {
      const { publicResolver, accounts } = await loadFixture(fixture)

      await expect(publicResolver)
        .write('setName', [targetNode, 'name2'], {
          account: accounts[1],
        })
        .toBeRevertedWithoutReason()
    })

    it('returns empty when fetching nonexistent name', async () => {
      const { publicResolver } = await loadFixture(fixture)

      await expect(publicResolver.read.name([targetNode])).resolves.toEqual('')
    })

    it('resets record on version change', async () => {
      const { publicResolver } = await loadFixture(fixture)

      await publicResolver.write.setName([targetNode, 'name1'])

      await expect(publicResolver.read.name([targetNode])).resolves.toEqual(
        'name1',
      )

      await publicResolver.write.clearRecords([targetNode])

      await expect(publicResolver.read.name([targetNode])).resolves.toEqual('')
    })
  })

  describe('pubkey', async () => {
    const pubkeyEmpty: [Hash, Hash] = [zeroHash, zeroHash]
    const pubkey1: [Hash, Hash] = [
      padHex('0x10', { dir: 'right', size: 32 }),
      padHex('0x20', { dir: 'right', size: 32 }),
    ]
    const pubkey2: [Hash, Hash] = [
      padHex('0x30', { dir: 'right', size: 32 }),
      padHex('0x40', { dir: 'right', size: 32 }),
    ]

    it('returns empty when fetching nonexistent values', async () => {
      const { publicResolver } = await loadFixture(fixture)

      await expect(
        publicResolver.read.pubkey([targetNode]),
      ).resolves.toMatchObject(pubkeyEmpty)
    })

    it('permits setting public key by owner', async () => {
      const { publicResolver } = await loadFixture(fixture)

      await expect(publicResolver)
        .write('setPubkey', [targetNode, ...pubkey1])
        .toEmitEvent('PubkeyChanged')
        .withArgs(targetNode, ...pubkey1)

      await expect(
        publicResolver.read.pubkey([targetNode]),
      ).resolves.toMatchObject(pubkey1)
    })

    it('can overwrite previously set value', async () => {
      const { publicResolver } = await loadFixture(fixture)

      await publicResolver.write.setPubkey([targetNode, ...pubkey1])
      await expect(
        publicResolver.read.pubkey([targetNode]),
      ).resolves.toMatchObject(pubkey1)

      await publicResolver.write.setPubkey([targetNode, ...pubkey2])
      await expect(
        publicResolver.read.pubkey([targetNode]),
      ).resolves.toMatchObject(pubkey2)
    })

    it('can overwrite to same value', async () => {
      const { publicResolver } = await loadFixture(fixture)

      await publicResolver.write.setPubkey([targetNode, ...pubkey1])
      await expect(
        publicResolver.read.pubkey([targetNode]),
      ).resolves.toMatchObject(pubkey1)

      await publicResolver.write.setPubkey([targetNode, ...pubkey1])
      await expect(
        publicResolver.read.pubkey([targetNode]),
      ).resolves.toMatchObject(pubkey1)
    })

    it('forbids setting value by non-owners', async () => {
      const { publicResolver, accounts } = await loadFixture(fixture)

      await expect(publicResolver)
        .write('setPubkey', [targetNode, ...pubkey1], {
          account: accounts[1],
        })
        .toBeRevertedWithoutReason()
    })

    it('forbids writing same value by non-owners', async () => {
      const { publicResolver, accounts } = await loadFixture(fixture)

      await publicResolver.write.setPubkey([targetNode, ...pubkey1])

      await expect(publicResolver)
        .write('setPubkey', [targetNode, ...pubkey1], {
          account: accounts[1],
        })
        .toBeRevertedWithoutReason()
    })

    it('forbids overwriting existing value by non-owners', async () => {
      const { publicResolver, accounts } = await loadFixture(fixture)

      await publicResolver.write.setPubkey([targetNode, ...pubkey1])

      await expect(publicResolver)
        .write('setPubkey', [targetNode, ...pubkey2], {
          account: accounts[1],
        })
        .toBeRevertedWithoutReason()
    })

    it('resets record on version change', async () => {
      const { publicResolver } = await loadFixture(fixture)

      await publicResolver.write.setPubkey([targetNode, ...pubkey1])

      await expect(
        publicResolver.read.pubkey([targetNode]),
      ).resolves.toMatchObject(pubkey1)

      await publicResolver.write.clearRecords([targetNode])

      await expect(
        publicResolver.read.pubkey([targetNode]),
      ).resolves.toMatchObject(pubkeyEmpty)
    })
  })

  describe('ABI', () => {
    it('returns a contentType of 0 when nothing is available', async () => {
      const { publicResolver } = await loadFixture(fixture)

      await expect(
        publicResolver.read.ABI([targetNode, 0xffffffffn]),
      ).resolves.toMatchObject([0n, '0x'])
    })

    it('returns an ABI after it has been set', async () => {
      const { publicResolver } = await loadFixture(fixture)

      await publicResolver.write.setABI([targetNode, 1n, '0x666f6f'])

      await expect(
        publicResolver.read.ABI([targetNode, 0xffffffffn]),
      ).resolves.toMatchObject([1n, '0x666f6f'])
    })

    it('returns the first valid ABI', async () => {
      const { publicResolver } = await loadFixture(fixture)

      await publicResolver.write.setABI([targetNode, 0x2n, '0x666f6f'])
      await publicResolver.write.setABI([targetNode, 0x4n, '0x626172'])

      await expect(
        publicResolver.read.ABI([targetNode, 0x7n]),
      ).resolves.toMatchObject([2n, '0x666f6f'])

      await expect(
        publicResolver.read.ABI([targetNode, 0x5n]),
      ).resolves.toMatchObject([4n, '0x626172'])
    })

    it('allows deleting ABIs', async () => {
      const { publicResolver } = await loadFixture(fixture)

      await publicResolver.write.setABI([targetNode, 1n, '0x666f6f'])

      await expect(
        publicResolver.read.ABI([targetNode, 0xffffffffn]),
      ).resolves.toMatchObject([1n, '0x666f6f'])

      await publicResolver.write.setABI([targetNode, 1n, '0x'])

      await expect(
        publicResolver.read.ABI([targetNode, 0xffffffffn]),
      ).resolves.toMatchObject([0n, '0x'])
    })

    it('rejects invalid content types', async () => {
      const { publicResolver } = await loadFixture(fixture)

      await expect(publicResolver)
        .write('setABI', [targetNode, 0x3n, '0x12'])
        .toBeRevertedWithoutReason()
    })

    it('forbids setting value by non-owners', async () => {
      const { publicResolver, accounts } = await loadFixture(fixture)

      await expect(publicResolver)
        .write('setABI', [targetNode, 1n, '0x666f6f'], {
          account: accounts[1],
        })
        .toBeRevertedWithoutReason()
    })

    it('resets on version change', async () => {
      const { publicResolver } = await loadFixture(fixture)

      await publicResolver.write.setABI([targetNode, 1n, '0x666f6f'])

      await expect(
        publicResolver.read.ABI([targetNode, 0xffffffffn]),
      ).resolves.toMatchObject([1n, '0x666f6f'])

      await publicResolver.write.clearRecords([targetNode])

      await expect(
        publicResolver.read.ABI([targetNode, 0xffffffffn]),
      ).resolves.toMatchObject([0n, '0x'])
    })

    it('can try all content types', async () => {
      const { publicResolver } = await loadFixture(fixture)
      await expect(
        publicResolver.read.ABI([targetNode, (1n << 256n) - 1n]),
      ).resolves.toMatchObject([0n, '0x'])
    })
  })

  describe('test', () => {
    const url1 = 'https://ethereum.org'
    const url2 = 'https://github.com/ethereum'

    it('permits setting text by owner', async () => {
      const { publicResolver } = await loadFixture(fixture)

      await expect(publicResolver)
        .write('setText', [targetNode, 'url', url1])
        .toEmitEvent('TextChanged')
        .withArgs(targetNode, 'url', 'url', url1)

      await expect(
        publicResolver.read.text([targetNode, 'url']),
      ).resolves.toEqual(url1)
    })

    it('can overwrite previously set text', async () => {
      const { publicResolver } = await loadFixture(fixture)

      await publicResolver.write.setText([targetNode, 'url', url1])
      await expect(
        publicResolver.read.text([targetNode, 'url']),
      ).resolves.toEqual(url1)

      await publicResolver.write.setText([targetNode, 'url', url2])
      await expect(
        publicResolver.read.text([targetNode, 'url']),
      ).resolves.toEqual(url2)
    })

    it('can overwrite to same text', async () => {
      const { publicResolver } = await loadFixture(fixture)

      await publicResolver.write.setText([targetNode, 'url', url1])
      await expect(
        publicResolver.read.text([targetNode, 'url']),
      ).resolves.toEqual(url1)

      await publicResolver.write.setText([targetNode, 'url', url1])
      await expect(
        publicResolver.read.text([targetNode, 'url']),
      ).resolves.toEqual(url1)
    })

    it('forbids setting text by non-owners', async () => {
      const { publicResolver, accounts } = await loadFixture(fixture)

      await expect(publicResolver)
        .write('setText', [targetNode, 'url', url1], {
          account: accounts[1],
        })
        .toBeRevertedWithoutReason()
    })

    it('forbids writing same text by non-owners', async () => {
      const { publicResolver, accounts } = await loadFixture(fixture)

      await publicResolver.write.setText([targetNode, 'url', url1])

      await expect(publicResolver)
        .write('setText', [targetNode, 'url', url1], {
          account: accounts[1],
        })
        .toBeRevertedWithoutReason()
    })

    it('forbids overwriting existing text by non-owners', async () => {
      const { publicResolver, accounts } = await loadFixture(fixture)

      await publicResolver.write.setText([targetNode, 'url', url1])

      await expect(publicResolver)
        .write('setText', [targetNode, 'url', url2], {
          account: accounts[1],
        })
        .toBeRevertedWithoutReason()
    })

    it('resets record on version change', async () => {
      const { publicResolver } = await loadFixture(fixture)

      await publicResolver.write.setText([targetNode, 'url', url1])

      await expect(
        publicResolver.read.text([targetNode, 'url']),
      ).resolves.toEqual(url1)

      await publicResolver.write.clearRecords([targetNode])

      await expect(
        publicResolver.read.text([targetNode, 'url']),
      ).resolves.toEqual('')
    })
  })

  describe('contenthash', () => {
    const contenthash1 = padHex('0x01', { dir: 'left', size: 32 })
    const contenthash2 = padHex('0x02', { dir: 'left', size: 32 })

    it('permits setting contenthash by owner', async () => {
      const { publicResolver } = await loadFixture(fixture)

      await expect(publicResolver)
        .write('setContenthash', [targetNode, contenthash1])
        .toEmitEvent('ContenthashChanged')
        .withArgs(targetNode, contenthash1)

      await expect(
        publicResolver.read.contenthash([targetNode]),
      ).resolves.toEqual(contenthash1)
    })

    it('can overwrite previously set contenthash', async () => {
      const { publicResolver } = await loadFixture(fixture)

      await publicResolver.write.setContenthash([targetNode, contenthash1])
      await expect(
        publicResolver.read.contenthash([targetNode]),
      ).resolves.toEqual(contenthash1)

      await publicResolver.write.setContenthash([targetNode, contenthash2])
      await expect(
        publicResolver.read.contenthash([targetNode]),
      ).resolves.toEqual(contenthash2)
    })

    it('can overwrite to same contenthash', async () => {
      const { publicResolver } = await loadFixture(fixture)

      await publicResolver.write.setContenthash([targetNode, contenthash1])
      await expect(
        publicResolver.read.contenthash([targetNode]),
      ).resolves.toEqual(contenthash1)

      await publicResolver.write.setContenthash([targetNode, contenthash1])
      await expect(
        publicResolver.read.contenthash([targetNode]),
      ).resolves.toEqual(contenthash1)
    })

    it('forbids setting contenthash by non-owners', async () => {
      const { publicResolver, accounts } = await loadFixture(fixture)

      await expect(publicResolver)
        .write('setContenthash', [targetNode, contenthash1], {
          account: accounts[1],
        })
        .toBeRevertedWithoutReason()
    })

    it('forbids writing same contenthash by non-owners', async () => {
      const { publicResolver, accounts } = await loadFixture(fixture)

      await publicResolver.write.setContenthash([targetNode, contenthash1])

      await expect(publicResolver)
        .write('setContenthash', [targetNode, contenthash1], {
          account: accounts[1],
        })
        .toBeRevertedWithoutReason()
    })

    it('returns empty when fetching nonexistent contenthash', async () => {
      const { publicResolver } = await loadFixture(fixture)

      await expect(
        publicResolver.read.contenthash([targetNode]),
      ).resolves.toEqual('0x')
    })

    it('resets record on version change', async () => {
      const { publicResolver } = await loadFixture(fixture)

      await publicResolver.write.setContenthash([targetNode, contenthash1])

      await expect(
        publicResolver.read.contenthash([targetNode]),
      ).resolves.toEqual(contenthash1)

      await publicResolver.write.clearRecords([targetNode])

      await expect(
        publicResolver.read.contenthash([targetNode]),
      ).resolves.toEqual('0x')
    })
  })

  describe('dns', () => {
    describe('records', () => {
      it('permits setting name by owner', async () => {
        const { publicResolver, hash, arec, b1rec, b2rec, soarec } =
          await loadFixture(fixtureWithDnsRecords)

        await expect(publicResolver)
          .transaction(hash)
          .toEmitEvent('DNSRecordChanged')

        await expect(
          publicResolver.read.dnsRecord([
            targetNode,
            keccak256(dnsEncodeName('a.eth.')),
            1,
          ]),
        ).resolves.toEqual(`0x${arec}`)

        await expect(
          publicResolver.read.dnsRecord([
            targetNode,
            keccak256(dnsEncodeName('b.eth.')),
            1,
          ]),
        ).resolves.toEqual(`0x${b1rec}${b2rec}`)

        await expect(
          publicResolver.read.dnsRecord([
            targetNode,
            keccak256(dnsEncodeName('eth.')),
            6,
          ]),
        ).resolves.toEqual(`0x${soarec}`)
      })

      it('should update existing records', async () => {
        const { publicResolver } = await loadFixture(fixtureWithDnsRecords)

        // a.eth. 3600 IN A 4.5.6.7
        const arec = '016103657468000001000100000e10000404050607' as const
        // eth. 86400 IN SOA ns1.ethdns.xyz. hostmaster.test.eth. 2018061502 15620 1800 1814400 14400
        const soarec =
          '03657468000006000100015180003a036e733106657468646e730378797a000a686f73746d6173746572057465737431036574680078492cbe00003d0400000708001baf8000003840' as const
        const rec = `0x${arec}${soarec}` as const

        await publicResolver.write.setDNSRecords([targetNode, rec])

        await expect(
          publicResolver.read.dnsRecord([
            targetNode,
            keccak256(dnsEncodeName('a.eth.')),
            1,
          ]),
        ).resolves.toEqual(`0x${arec}`)
        await expect(
          publicResolver.read.dnsRecord([
            targetNode,
            keccak256(dnsEncodeName('eth.')),
            6,
          ]),
        ).resolves.toEqual(`0x${soarec}`)
      })

      it('should keep track of entries', async () => {
        const { publicResolver } = await loadFixture(fixtureWithDnsRecords)

        // c.eth. 3600 IN A 1.2.3.4
        const crec = '016303657468000001000100000e10000401020304' as const
        const rec = `0x${crec}` as const

        await publicResolver.write.setDNSRecords([targetNode, rec])

        // Initial check
        await expect(
          publicResolver.read.hasDNSRecords([
            targetNode,
            keccak256(dnsEncodeName('c.eth.')),
          ]),
        ).resolves.toEqual(true)
        await expect(
          publicResolver.read.hasDNSRecords([
            targetNode,
            keccak256(dnsEncodeName('d.eth.')),
          ]),
        ).resolves.toEqual(false)

        // Update with no new data makes no difference
        await publicResolver.write.setDNSRecords([targetNode, rec])
        await expect(
          publicResolver.read.hasDNSRecords([
            targetNode,
            keccak256(dnsEncodeName('c.eth.')),
          ]),
        ).resolves.toEqual(true)

        // c.eth. 3600 IN A
        const crec2 = '016303657468000001000100000e100000' as const
        const rec2 = `0x${crec2}` as const

        await publicResolver.write.setDNSRecords([targetNode, rec2])

        // Removal returns to 0
        await expect(
          publicResolver.read.hasDNSRecords([
            targetNode,
            keccak256(dnsEncodeName('c.eth.')),
          ]),
        ).resolves.toEqual(false)
      })

      it('should handle single-record updates', async () => {
        const { publicResolver } = await loadFixture(fixtureWithDnsRecords)

        // e.eth. 3600 IN A 1.2.3.4
        const erec = '016503657468000001000100000e10000401020304' as const
        const rec = `0x${erec}` as const

        await publicResolver.write.setDNSRecords([targetNode, rec])

        await expect(
          publicResolver.read.dnsRecord([
            targetNode,
            keccak256(dnsEncodeName('e.eth.')),
            1,
          ]),
        ).resolves.toEqual(`0x${erec}`)
      })

      it('forbids setting DNS records by non-owners', async () => {
        const { publicResolver, accounts } = await loadFixture(
          fixtureWithDnsRecords,
        )

        // f.eth. 3600 IN A 1.2.3.4
        const frec = '016603657468000001000100000e10000401020304' as const
        const rec = `0x${frec}` as const

        await expect(publicResolver)
          .write('setDNSRecords', [targetNode, rec], {
            account: accounts[1],
          })
          .toBeRevertedWithoutReason()
      })

      it('resets record on version change', async () => {
        const { publicResolver } = await loadFixture(fixtureWithDnsRecords)

        await publicResolver.write.clearRecords([targetNode])

        await expect(
          publicResolver.read.dnsRecord([
            targetNode,
            keccak256(dnsEncodeName('a.eth.')),
            1,
          ]),
        ).resolves.toEqual('0x')
        await expect(
          publicResolver.read.dnsRecord([
            targetNode,
            keccak256(dnsEncodeName('b.eth.')),
            1,
          ]),
        ).resolves.toEqual('0x')
        await expect(
          publicResolver.read.dnsRecord([
            targetNode,
            keccak256(dnsEncodeName('eth.')),
            6,
          ]),
        ).resolves.toEqual('0x')
      })
    })

    describe('zonehash', () => {
      const zonehash1 = padHex('0x01', { dir: 'left', size: 32 })
      const zonehash2 = padHex('0x02', { dir: 'left', size: 32 })

      it('permits setting zonehash by owner', async () => {
        const { publicResolver } = await loadFixture(fixture)

        await expect(publicResolver)
          .write('setZonehash', [targetNode, zonehash1])
          .toEmitEvent('DNSZonehashChanged')

        await expect(
          publicResolver.read.zonehash([targetNode]),
        ).resolves.toEqual(zonehash1)
      })

      it('can overwrite previously set zonehash', async () => {
        const { publicResolver } = await loadFixture(fixture)

        await publicResolver.write.setZonehash([targetNode, zonehash1])
        await expect(
          publicResolver.read.zonehash([targetNode]),
        ).resolves.toEqual(zonehash1)

        await publicResolver.write.setZonehash([targetNode, zonehash2])
        await expect(
          publicResolver.read.zonehash([targetNode]),
        ).resolves.toEqual(zonehash2)
      })

      it('can overwrite to same zonehash', async () => {
        const { publicResolver } = await loadFixture(fixture)

        await publicResolver.write.setZonehash([targetNode, zonehash1])
        await expect(
          publicResolver.read.zonehash([targetNode]),
        ).resolves.toEqual(zonehash1)

        await publicResolver.write.setZonehash([targetNode, zonehash1])
        await expect(
          publicResolver.read.zonehash([targetNode]),
        ).resolves.toEqual(zonehash1)
      })

      it('forbids setting zonehash by non-owners', async () => {
        const { publicResolver, accounts } = await loadFixture(fixture)

        await expect(publicResolver)
          .write('setZonehash', [targetNode, zonehash1], {
            account: accounts[1],
          })
          .toBeRevertedWithoutReason()
      })

      it('forbids writing same zonehash by non-owners', async () => {
        const { publicResolver, accounts } = await loadFixture(fixture)

        await publicResolver.write.setZonehash([targetNode, zonehash1])

        await expect(publicResolver)
          .write('setZonehash', [targetNode, zonehash1], {
            account: accounts[1],
          })
          .toBeRevertedWithoutReason()
      })

      it('returns empty when fetching nonexistent zonehash', async () => {
        const { publicResolver } = await loadFixture(fixture)

        await expect(
          publicResolver.read.zonehash([targetNode]),
        ).resolves.toEqual('0x')
      })

      it('emits the correct event', async () => {
        const { publicResolver } = await loadFixture(fixture)

        await expect(publicResolver)
          .write('setZonehash', [targetNode, zonehash1])
          .toEmitEvent('DNSZonehashChanged')
          .withArgs(targetNode, zeroHash, zonehash1)

        await expect(publicResolver)
          .write('setZonehash', [targetNode, zonehash2])
          .toEmitEvent('DNSZonehashChanged')
          .withArgs(targetNode, zonehash1, zonehash2)

        await expect(publicResolver)
          .write('setZonehash', [targetNode, zeroHash])
          .toEmitEvent('DNSZonehashChanged')
          .withArgs(targetNode, zonehash2, zeroHash)
      })

      it('resets record on version change', async () => {
        const { publicResolver } = await loadFixture(fixture)

        await publicResolver.write.setZonehash([targetNode, zonehash1])

        await expect(
          publicResolver.read.zonehash([targetNode]),
        ).resolves.toEqual(zonehash1)

        await publicResolver.write.clearRecords([targetNode])

        await expect(
          publicResolver.read.zonehash([targetNode]),
        ).resolves.toEqual('0x')
      })
    })
  })

  describe('implementsInterface', () => {
    const interface1 = '0x12345678'

    it('permits setting interface by owner', async () => {
      const { publicResolver, accounts } = await loadFixture(fixture)

      await expect(publicResolver)
        .write('setInterface', [targetNode, interface1, accounts[0].address])
        .toEmitEvent('InterfaceChanged')
        .withArgs(targetNode, interface1, accounts[0].address)

      await expect(
        publicResolver.read.interfaceImplementer([targetNode, interface1]),
      ).resolves.toEqualAddress(accounts[0].address)
    })

    it('can update previously set interface', async () => {
      const { publicResolver, accounts } = await loadFixture(fixture)

      await publicResolver.write.setInterface([
        targetNode,
        interface1,
        accounts[0].address,
      ])
      await expect(
        publicResolver.read.interfaceImplementer([targetNode, interface1]),
      ).resolves.toEqualAddress(accounts[0].address)

      await publicResolver.write.setInterface([
        targetNode,
        interface1,
        accounts[1].address,
      ])
      await expect(
        publicResolver.read.interfaceImplementer([targetNode, interface1]),
      ).resolves.toEqualAddress(accounts[1].address)
    })

    it('forbids setting interface by non-owner', async () => {
      const { publicResolver, accounts } = await loadFixture(fixture)

      await expect(publicResolver)
        .write('setInterface', [targetNode, interface1, accounts[0].address], {
          account: accounts[1],
        })
        .toBeRevertedWithoutReason()
    })

    it('returns zero when fetching nonexistent interface', async () => {
      const { publicResolver } = await loadFixture(fixture)

      await expect(
        publicResolver.read.interfaceImplementer([targetNode, interface1]),
      ).resolves.toEqualAddress(zeroAddress)
    })

    it('falls back to calling implementsInterface on addr', async () => {
      const { publicResolver, accounts } = await loadFixture(fixture)

      // Set addr to the resolver itself, since it has interface implementations.
      await publicResolver.write.setAddr([targetNode, publicResolver.address])

      const addrArtifact = await hre.artifacts.readArtifact('IAddrResolver')
      const addrInterfaceId = createInterfaceId(addrArtifact.abi)

      await expect(
        publicResolver.read.interfaceImplementer([targetNode, addrInterfaceId]),
      ).resolves.toEqualAddress(publicResolver.address)
    })

    it('returns 0 on fallback when target contract does not implement interface', async () => {
      const { publicResolver } = await loadFixture(fixture)

      await publicResolver.write.setAddr([targetNode, publicResolver.address])

      await expect(
        publicResolver.read.interfaceImplementer([targetNode, interface1]),
      ).resolves.toEqualAddress(zeroAddress)
    })

    it('returns 0 on fallback when target contract does not support implementsInterface', async () => {
      const { ensRegistry, publicResolver } = await loadFixture(fixture)

      // Set addr to the ENS registry, which doesn't implement supportsInterface.
      await publicResolver.write.setAddr([targetNode, ensRegistry.address])

      const supportsInterfaceArtifact = await hre.artifacts.readArtifact(
        '@openzeppelin/contracts/utils/introspection/IERC165.sol:IERC165',
      )
      const supportsInterfaceId = createInterfaceId(
        supportsInterfaceArtifact.abi,
      )

      await expect(
        publicResolver.read.interfaceImplementer([
          targetNode,
          supportsInterfaceId,
        ]),
      ).resolves.toEqualAddress(zeroAddress)
    })

    it('returns 0 on fallback when target is not a contract', async () => {
      const { publicResolver, accounts } = await loadFixture(fixture)

      await publicResolver.write.setAddr([targetNode, accounts[0].address])

      const supportsInterfaceArtifact = await hre.artifacts.readArtifact(
        '@openzeppelin/contracts/utils/introspection/IERC165.sol:IERC165',
      )
      const supportsInterfaceId = createInterfaceId(
        supportsInterfaceArtifact.abi,
      )

      await expect(
        publicResolver.read.interfaceImplementer([
          targetNode,
          supportsInterfaceId,
        ]),
      ).resolves.toEqualAddress(zeroAddress)
    })

    it('resets record on version change', async () => {
      const { publicResolver } = await loadFixture(fixture)

      await publicResolver.write.setInterface([
        targetNode,
        interface1,
        publicResolver.address,
      ])

      await expect(
        publicResolver.read.interfaceImplementer([targetNode, interface1]),
      ).resolves.toEqualAddress(publicResolver.address)

      await publicResolver.write.clearRecords([targetNode])

      await expect(
        publicResolver.read.interfaceImplementer([targetNode, interface1]),
      ).resolves.toEqualAddress(zeroAddress)
    })
  })

  describe('authorisations', () => {
    it('permits authorisations to be set', async () => {
      const { publicResolver, accounts } = await loadFixture(fixture)

      await expect(publicResolver)
        .write('setApprovalForAll', [accounts[1].address, true])
        .toEmitEvent('ApprovalForAll')
        .withArgs(accounts[0].address, accounts[1].address, true)

      await expect(
        publicResolver.read.isApprovedForAll([
          accounts[0].address,
          accounts[1].address,
        ]),
      ).resolves.toEqual(true)
    })

    it('permits authorised users to make changes', async () => {
      const { publicResolver, accounts } = await loadFixture(fixture)

      await publicResolver.write.setApprovalForAll([accounts[1].address, true])

      await publicResolver.write.setAddr([targetNode, accounts[1].address], {
        account: accounts[1],
      })

      await expect(
        publicResolver.read.addr([targetNode]) as Promise<Address>,
      ).resolves.toEqualAddress(accounts[1].address)
    })

    it('permits authorisations to be cleared', async () => {
      const { publicResolver, accounts } = await loadFixture(fixture)

      await publicResolver.write.setApprovalForAll([accounts[1].address, true])

      await publicResolver.write.setApprovalForAll([accounts[1].address, false])

      await expect(publicResolver)
        .write('setAddr', [targetNode, accounts[1].address], {
          account: accounts[1],
        })
        .toBeRevertedWithoutReason()
    })

    it('permits non-owners to set authorisations', async () => {
      const { publicResolver, accounts } = await loadFixture(fixture)

      await publicResolver.write.setApprovalForAll(
        [accounts[2].address, true],
        {
          account: accounts[1],
        },
      )

      // The authorisation should have no effect, because accounts[1] is not the owner.
      await expect(publicResolver)
        .write('setAddr', [targetNode, accounts[0].address], {
          account: accounts[2],
        })
        .toBeRevertedWithoutReason()
    })

    it('checks the authorisation for the current owner', async () => {
      const { ensRegistry, publicResolver, accounts } = await loadFixture(
        fixture,
      )

      await publicResolver.write.setApprovalForAll(
        [accounts[2].address, true],
        { account: accounts[1] },
      )
      await ensRegistry.write.setOwner([targetNode, accounts[1].address])

      await publicResolver.write.setAddr([targetNode, accounts[0].address], {
        account: accounts[2],
      })

      await expect(
        publicResolver.read.addr([targetNode]) as Promise<Address>,
      ).resolves.toEqualAddress(accounts[0].address)
    })

    it('trusted contract can bypass authorisation', async () => {
      const { publicResolver, accounts } = await loadFixture(fixture)

      await publicResolver.write.setAddr([targetNode, accounts[9].address], {
        account: accounts[9],
      })

      await expect(
        publicResolver.read.addr([targetNode]) as Promise<Address>,
      ).resolves.toEqualAddress(accounts[9].address)
    })

    it('emits an ApprovalForAll log', async () => {
      const { publicResolver, accounts } = await loadFixture(fixture)

      await expect(publicResolver)
        .write('setApprovalForAll', [accounts[1].address, true])
        .toEmitEvent('ApprovalForAll')
        .withArgs(accounts[0].address, accounts[1].address, true)
    })

    it('reverts if attempting to approve self as an operator', async () => {
      const { publicResolver, accounts } = await loadFixture(fixture)

      await expect(publicResolver)
        .write('setApprovalForAll', [accounts[1].address, true], {
          account: accounts[1],
        })
        .toBeRevertedWithString('ERC1155: setting approval status for self')
    })

    it('permits name wrapper owner to make changes if owner is set to name wrapper address', async () => {
      const { ensRegistry, nameWrapper, publicResolver, accounts } =
        await loadFixture(fixture)

      const owner = accounts[0]
      const operator = accounts[2]

      await expect(publicResolver)
        .write('setAddr', [targetNode, owner.address], { account: operator })
        .toBeRevertedWithoutReason()

      await ensRegistry.write.setOwner([targetNode, nameWrapper.address], {
        account: owner,
      })

      await publicResolver.write.setAddr([targetNode, owner.address], {
        account: operator,
      })

      await expect(
        publicResolver.read.addr([targetNode]) as Promise<Address>,
      ).resolves.toEqualAddress(owner.address)
    })
  })

  describe('token approvals', async () => {
    it('permits delegate to be approved', async () => {
      const { publicResolver, accounts } = await loadFixture(fixture)

      await publicResolver.write.approve([
        targetNode,
        accounts[1].address,
        true,
      ])

      await expect(
        publicResolver.read.isApprovedFor([
          accounts[0].address,
          targetNode,
          accounts[1].address,
        ]),
      ).resolves.toEqual(true)
    })

    it('permits delegated users to make changes', async () => {
      const { publicResolver, accounts } = await loadFixture(fixture)

      await publicResolver.write.approve([
        targetNode,
        accounts[1].address,
        true,
      ])

      await expect(
        publicResolver.read.isApprovedFor([
          accounts[0].address,
          targetNode,
          accounts[1].address,
        ]),
      ).resolves.toEqual(true)

      await publicResolver.write.setAddr([targetNode, accounts[1].address], {
        account: accounts[1],
      })

      await expect(
        publicResolver.read.addr([targetNode]) as Promise<Address>,
      ).resolves.toEqualAddress(accounts[1].address)
    })

    it('permits delegations to be cleared', async () => {
      const { publicResolver, accounts } = await loadFixture(fixture)

      await publicResolver.write.approve([
        targetNode,
        accounts[1].address,
        true,
      ])

      await publicResolver.write.approve([
        targetNode,
        accounts[1].address,
        false,
      ])

      await expect(publicResolver)
        .write('setAddr', [targetNode, accounts[0].address], {
          account: accounts[1],
        })
        .toBeRevertedWithoutReason()
    })

    it('permits non-owners to set delegations', async () => {
      const { publicResolver, accounts } = await loadFixture(fixture)

      await publicResolver.write.approve(
        [targetNode, accounts[2].address, true],
        {
          account: accounts[1],
        },
      )

      // The delegation should have no effect, because accounts[1] is not the owner.
      await expect(publicResolver)
        .write('setAddr', [targetNode, accounts[0].address], {
          account: accounts[2],
        })
        .toBeRevertedWithoutReason()
    })

    it('checks the delegation for the current owner', async () => {
      const { ensRegistry, publicResolver, accounts } = await loadFixture(
        fixture,
      )

      await publicResolver.write.approve(
        [targetNode, accounts[2].address, true],
        { account: accounts[1] },
      )
      await ensRegistry.write.setOwner([targetNode, accounts[1].address])

      await publicResolver.write.setAddr([targetNode, accounts[0].address], {
        account: accounts[2],
      })

      await expect(
        publicResolver.read.addr([targetNode]) as Promise<Address>,
      ).resolves.toEqualAddress(accounts[0].address)
    })

    it('emits an Approved log', async () => {
      const { publicResolver, accounts } = await loadFixture(fixture)

      const owner = accounts[0].address
      const delegate = accounts[1].address

      await expect(publicResolver)
        .write('approve', [targetNode, delegate, true])
        .toEmitEvent('Approved')
        .withArgs(owner, targetNode, delegate, true)
    })

    it('reverts if attempting to delegate to self', async () => {
      const { publicResolver, accounts } = await loadFixture(fixture)

      await expect(publicResolver)
        .write('approve', [targetNode, accounts[1].address, true], {
          account: accounts[1],
        })
        .toBeRevertedWithString('Setting delegate status for self')
    })
  })

  describe('multicall', async () => {
    const urlValue = 'https://ethereum.org/'

    it('allows setting multiple fields', async () => {
      const { publicResolver, accounts } = await loadFixture(fixture)

      const setAddrCall = encodeFunctionData({
        abi: publicResolver.abi,
        functionName: 'setAddr',
        args: [targetNode, accounts[1].address],
      })
      const setTextCall = encodeFunctionData({
        abi: publicResolver.abi,
        functionName: 'setText',
        args: [targetNode, 'url', urlValue],
      })

      const hash = await publicResolver.write.multicall([
        [setAddrCall, setTextCall],
      ])

      await expect(publicResolver)
        .transaction(hash)
        .toEmitEvent('AddrChanged')
        .withArgs(targetNode, accounts[1].address)
      await expect(publicResolver)
        .transaction(hash)
        .toEmitEvent('AddressChanged')
        .withArgs(targetNode, COIN_TYPE_ETH, accounts[1].address)
      await expect(publicResolver)
        .transaction(hash)
        .toEmitEvent('TextChanged')
        .withArgs(targetNode, 'url', 'url', urlValue)

      await expect(
        publicResolver.read.addr([targetNode]) as Promise<Address>,
      ).resolves.toEqualAddress(accounts[1].address)
      await expect(
        publicResolver.read.text([targetNode, 'url']),
      ).resolves.toEqual(urlValue)
    })

    it('allows reading multiple fields', async () => {
      const { publicResolver, accounts } = await loadFixture(fixture)

      await publicResolver.write.setAddr([targetNode, accounts[1].address])
      await publicResolver.write.setText([targetNode, 'url', urlValue])

      const addrCall = encodeFunctionData({
        abi: publicResolver.abi,
        functionName: 'addr',
        args: [targetNode],
      })
      const textCall = encodeFunctionData({
        abi: publicResolver.abi,
        functionName: 'text',
        args: [targetNode, 'url'],
      })

      const {
        result: [addrResult, textResult],
      } = await publicResolver.simulate.multicall([[addrCall, textCall]])

      const decodedAddr = decodeFunctionResult<
        (typeof publicResolver)['abi'],
        'addr',
        [Hex]
      >({
        abi: publicResolver.abi,
        functionName: 'addr',
        args: [targetNode],
        data: addrResult,
      })
      const decodedText = decodeFunctionResult({
        abi: publicResolver.abi,
        functionName: 'text',
        data: textResult,
      })

      expect(decodedAddr).toEqualAddress(accounts[1].address)
      expect(decodedText).toEqual(urlValue)
    })
  })
})
