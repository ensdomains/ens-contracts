import { artifacts, deployScript } from '@rocketh'
import {
  encodeFunctionData,
  getAddress,
  namehash,
  parseAbi,
  zeroAddress,
  type Address,
} from 'viem'
import { dnsEncodeName } from '../../test/fixtures/dnsEncodeName.js'
import { fetchPublicSuffixes } from './05_deploy_public_suffix_list.js'

// using the Multicall3 contract, which is deployed on pretty much every live chain in existence at 0xcA11bde05977b3631167028862bE2a173976CA11
// for devnet deployments, the same contract address can be used since we can use the pre-signed deploy transaction
// using the multicall contract allows us to batch many enableNode txs together
// for live network deployments, this is useful to save total gas used
// for devnet network deployments, this is useful to save a lot of time (many minutes)

const multicallAddress = '0xcA11bde05977b3631167028862bE2a173976CA11'

const multicallAbi = parseAbi([
  'struct Call { address target; bytes callData; }',
  'struct Result { bool success; bytes returnData; }',
  'function aggregate(Call[] calldata calls) public payable returns (uint256 blockNumber, bytes[] memory returnData)',
])

export default deployScript(
  async ({ get, read, tx, namedAccounts: { deployer }, network, config }) => {
    const registry = get<(typeof artifacts.ENSRegistry)['abi']>('ENSRegistry')
    const publicSuffixList = get<
      (typeof artifacts.SimplePublicSuffixList)['abi']
    >('SimplePublicSuffixList')
    const dnsRegistrar =
      get<(typeof artifacts.DNSRegistrar)['abi']>('DNSRegistrar')

    const fetchedSuffixes = await fetchPublicSuffixes()
    const allowUnsafe =
      network.tags?.allow_unsafe ||
      (network.tags?.test && !config.saveDeployments)

    const shouldReplaceCache = new Map<Address, Boolean>()
    shouldReplaceCache.set(zeroAddress, true)
    async function shouldReplace(owner: Address) {
      owner = getAddress(owner)
      if (shouldReplaceCache.has(owner)) {
        return shouldReplaceCache.get(owner)
      }
      const state = await read(dnsRegistrar, {
        functionName: 'wasRegistrar',
        args: [owner],
      })
      shouldReplaceCache.set(owner, state)
      return state
    }

    const suffixes = (
      await Promise.all(
        fetchedSuffixes.map(async (suffix) => {
          if (!suffix.match(/^[a-z0-9]+$/)) return
          if (allowUnsafe) {
            return suffix // skip checks for test networks
          }
          const owner = await read(registry, {
            functionName: 'owner',
            args: [namehash(suffix)],
          })
          if (getAddress(owner) === getAddress(dnsRegistrar.address)) {
            console.warn(`  - Skipping .${suffix}; already registrar`)
            return
          }
          const isPublicSuffix = await read(publicSuffixList, {
            functionName: 'isPublicSuffix',
            args: [dnsEncodeName(suffix)],
          })
          if (!isPublicSuffix) {
            console.warn(`  - Skipping .${suffix}; not in the PSL`)
            return
          }
          if (!(await shouldReplace(owner))) {
            console.warn(`  - Skipping .${suffix}; not previous registrar`)
            return
          }
          return suffix
        }),
      )
    ).filter((x): x is string => !!x)
    console.log(`  - Processing ${suffixes.length} public suffixes`)

    const batchAmount = allowUnsafe ? 1000 : 25

    // Send all transactions in batches
    for (let i = 0; i < suffixes.length; i += batchAmount) {
      const batch = suffixes.slice(i, i + batchAmount)
      console.log(`  - Enabling ${batch.length} suffixes`)
      await tx({
        to: multicallAddress,
        data: encodeFunctionData({
          abi: multicallAbi,
          functionName: 'aggregate',
          args: [
            batch.map((suffix) => ({
              target: dnsRegistrar.address,
              callData: encodeFunctionData({
                abi: dnsRegistrar.abi,
                functionName: 'enableNode',
                args: [dnsEncodeName(suffix)],
              }),
            })),
          ],
        }),
        gas: allowUnsafe ? 28000000n : undefined,
        account: deployer,
      })
    }

    console.log(`  - Enabled ${suffixes.length} suffixes`)
  },
  {
    id: 'DNSRegistrar:set-tlds v1.0.0',
    tags: ['category:dnsregistrar', 'DNSRegistrar', 'DNSRegistrar:set-tlds'],
    dependencies: [
      'ENSRegistry',
      'SimplePublicSuffixList',
      'DNSRegistrar:contract',
      'Root',
      'Multicall3',
    ],
  },
)
