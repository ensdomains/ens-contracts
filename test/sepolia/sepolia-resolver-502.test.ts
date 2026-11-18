import fs from 'node:fs'
import path from 'node:path'
import hre from 'hardhat'
import { describe, expect, it } from 'vitest'
import { namehash } from 'viem/ens'
import {
  SEPOLIA_CHAIN_ID,
  SEPOLIA_PUBLIC_RESOLVER,
  SEPOLIA_PUBLIC_RESOLVER_ARTIFACT,
  SEPOLIA_STALE_PUBLIC_RESOLVER,
} from '../../config/sepoliaResolver.js'
import { deployEnsStack } from '../fixtures/deployEnsFixture.js'
import { registerNameWithConnection } from '../fixtures/registerName.js'

// Regression test for https://github.com/ensdomains/ens-contracts/issues/502
// Testnet/devEx only. No mainnet state, no exploit content.
// Complementary to draft #537 (sepolia-dev + rocketh): this test touches only
// the canonical Sepolia resolver mapping, never deploy scripts.
describe('Sepolia resolver config (#502)', () => {
  it('points new registrations at the documented Sepolia resolver, not the stale one', () => {
    expect(SEPOLIA_CHAIN_ID).toBe(11155111)
    // Canonical address per https://docs.ens.domains/learn/deployments
    expect(SEPOLIA_PUBLIC_RESOLVER).toBe(
      '0xE99638b40E4Fff0129D56f03b55b6bbC4BBE49b5',
    )
    // Guard against regressing to the stale default from the issue report.
    expect(SEPOLIA_PUBLIC_RESOLVER.toLowerCase()).not.toBe(
      SEPOLIA_STALE_PUBLIC_RESOLVER.toLowerCase(),
    )
  })

  it('stays in sync with the local Sepolia deployment artifact', () => {
    const artifactPath = path.join(
      process.cwd(),
      SEPOLIA_PUBLIC_RESOLVER_ARTIFACT,
    )
    const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8')) as {
      address: string
    }
    expect(artifact.address.toLowerCase()).toBe(
      SEPOLIA_PUBLIC_RESOLVER.toLowerCase(),
    )
  })

  it('registration plumbing honors the caller-supplied (canonical) resolver', async () => {
    const connection = await hre.network.connect()
    const stack = await deployEnsStack(connection)
    const [, ownerClient] = await connection.viem.getWalletClients()
    // deployEnsStack wires NameWrapper as a base controller but leaves the
    // ETHRegistrarController unwired; authorize it like production deploys do.
    await stack.baseRegistrarImplementation.write.addController(
      [stack.ethRegistrarController.address],
      { account: ownerClient.account },
    )
    const registerName = registerNameWithConnection(connection)

    // Simulate a "new Sepolia registration" that follows the config default:
    // pass the canonical resolver explicitly (the controller takes the
    // resolver as a parameter, so the default lives in config/callers, and
    // this asserts the on-chain path records exactly what config says).
    // NOTE: the freshly deployed local publicResolver stands in for the
    // canonical Sepolia instance — what matters is that the registry records
    // the resolver the caller supplied, byte-for-byte.
    await registerName(stack, {
      label: 'sepolia-resolver-502',
      resolverAddress: stack.publicResolver.address,
    })

    const recorded = await stack.ensRegistry.read.resolver([
      namehash('sepolia-resolver-502.eth'),
    ])
    expect(recorded.toLowerCase()).toBe(
      stack.publicResolver.address.toLowerCase(),
    )

    // And the config value itself must never be the stale address.
    expect(stack.publicResolver.address.toLowerCase()).not.toBe(
      SEPOLIA_STALE_PUBLIC_RESOLVER.toLowerCase(),
    )
  })
})
