import hre from 'hardhat'
import {
  encodeAbiParameters,
  encodeFunctionData,
  namehash,
  parseAbi,
  stringToHex,
} from 'viem'
import { shouldSupportInterfaces } from '@ensdomains/hardhat-chai-matchers-viem/behaviour'

import { dnsEncodeName } from '../fixtures/dnsEncodeName.js'
import { COIN_TYPE_ETH } from '../fixtures/ensip19.js'

const testAddress = '0x8000000000000000000000000000000000000001'
const testName = dnsEncodeName('ignored1')
const testNode = namehash('ignored2')

const connection = await hre.network.connect()

function fixture() {
  return connection.viem.deployContract('BasicExtendedDNSResolver', [])
}
const loadFixture = async () => connection.networkHelpers.loadFixture(fixture)

describe('BasicExtendedDNSResolver', () => {
  shouldSupportInterfaces({
    contract: () => loadFixture(),
    interfaces: ['IExtendedDNSResolver'],
  })

  it('addr()', async () => {
    const F = await loadFixture()
    const answer = await F.read.resolve([
      testName,
      encodeFunctionData({
        abi: parseAbi(['function addr(bytes32) returns (address)']),
        args: [testNode],
      }),
      stringToHex(`${testAddress}`),
    ])
    expect(answer).toStrictEqual(
      encodeAbiParameters([{ type: 'address' }], [testAddress]),
    )
  })

  it('addr(60)', async () => {
    const F = await loadFixture()
    const answer = await F.read.resolve([
      testName,
      encodeFunctionData({
        abi: parseAbi(['function addr(bytes32, uint256) returns (bytes)']),
        args: [testNode, COIN_TYPE_ETH],
      }),
      stringToHex(`${testAddress}`),
    ])
    expect(answer).toStrictEqual(
      encodeAbiParameters([{ type: 'bytes' }], [testAddress]),
    )
  })

  it('addr(<not 60>)', async () => {
    const F = await loadFixture()
    const answer = await F.read.resolve([
      testName,
      encodeFunctionData({
        abi: parseAbi(['function addr(bytes32, uint256) returns (bytes)']),
        args: [testNode, 1n],
      }),
      stringToHex(`${testAddress}`),
    ])
    expect(answer).toStrictEqual(
      encodeAbiParameters([{ type: 'bytes' }], ['0x']),
    )
  })

  it('UnsupportedResolverProfile', async () => {
    const F = await loadFixture()
    const name = 'any.eth'
    const selector = '0x12345678'
    await expect(
      F.read.resolve([
        dnsEncodeName(name),
        selector, // unknown profile
        stringToHex(`${testAddress}`),
      ]),
    )
      .toBeRevertedWithCustomError('UnsupportedResolverProfile')
      .withArgs([selector])
  })

  it('InvalidAddressFormat', async () => {
    const F = await loadFixture()
    await expect(
      F.read.resolve([
        dnsEncodeName('ignored1'),
        encodeFunctionData({
          abi: parseAbi(['function addr(bytes32) returns (address)']),
          args: [testNode],
        }),
        stringToHex('0x1234'), // not 42 bytes
      ]),
    ).toBeRevertedWithCustomError('InvalidAddressFormat')
  })
})
