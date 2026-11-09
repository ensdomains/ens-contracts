# Threat model: ens-contracts (ENS v1)

Severity and scope follow the ENS bug bounty on Immunefi (https://immunefi.com/bug-bounty/ens/information/). Where
this file and that page disagree, the Immunefi page wins.

## What this project does and where untrusted input enters
ENS (Ethereum Name Service) maps human-readable names like `alice.eth` to addresses and other records. This
repository holds the v1 core contracts deployed on Ethereum mainnet, plus reverse resolution contracts on several
L2s. Names are NFTs: `.eth` second-level names are ERC-721 tokens in `BaseRegistrarImplementation`, and wrapped
names are ERC-1155 tokens in `NameWrapper`. Funds at risk are mainly registration and renewal payments held by the
registrar controllers, and anything sent to an address that an ENS name resolves to.

The contracts are immutable or governed by the ENS DAO. Untrusted input arrives as:
- Calls from any account to any external function, including re-entrant calls via ERC-721/ERC-1155 receiver hooks,
  ETH refunds, and resolvers or registries supplied by users.
- Arbitrary resolver contracts: anyone can point a name at any contract, and `UniversalResolver` will call it.
- CCIP-Read (EIP-3668) responses from offchain gateways, which are attacker-controlled data.
- DNSSEC proofs submitted to `DNSSECImpl` / `DNSRegistrar` (attacker-chosen DNS wire-format records, signatures and
  keys).
- DNS-encoded names, labels, text and multicall payloads passed as calldata.
- Signatures for reverse-record setting (`L2ReverseRegistrar`, `StandaloneReverseRegistrar`, `SignatureUtils`,
  `UniversalSigValidator`), including ERC-1271 and ERC-6492 contract signatures.

## Components that matter most / least
Most important (deployed on mainnet; see `deployments/mainnet/` and the deployments wiki page that Immunefi lists as
the authoritative asset list):
- `registry/ENSRegistry*.sol`: node ownership, operators, resolver and TTL. Anything that lets an account change a
  node it does not control.
- `ethregistrar/`: `BaseRegistrarImplementation` (expiry, grace period, reclaim), `ETHRegistrarController`
  (commit-reveal, payment, refunds, referrers), price oracles (`StablePriceOracle`, `ExponentialPremiumPriceOracle`),
  `StaticBulkRenewal`, `RegistrarSecurityController`.
- `wrapper/NameWrapper.sol`, `ERC1155Fuse.sol`: fuses (`CANNOT_UNWRAP`, `PARENT_CANNOT_CONTROL`, `CANNOT_TRANSFER`
  and the rest), emancipation, expiry interaction with fuses, wrap/unwrap of `.eth` and other names. Bypassing a
  burned fuse is in scope at full severity.
- `resolvers/`: `PublicResolver` and its profiles (authorisation via registry, NameWrapper, operators and
  delegates; record versioning; `multicall`), `ExtendedResolver`, `ExtendedDNSResolver`, `OwnedResolver`.
- `universalResolver/` and `ccipRead/`: recursive resolver lookup, wildcard resolution, batched CCIP-Read, error and
  revert-data handling, gateway selection. Anything that makes a victim name resolve to attacker-chosen data.
- `reverseRegistrar/` and `reverseResolver/`: forging or replaying a primary-name claim for an address the attacker
  does not control, on mainnet or any L2.
- `dnssec-oracle/` and `dnsregistrar/`: RR parsing (`RRUtils`), signature/digest verification (RSA via modexp, P-256),
  NSEC/NSEC3 handling, proof replay, and claiming or resolving a DNS name without a valid DNSSEC chain for it.
- `root/`: `Root` and `RootSecurityController`.
- `utils/`: `NameCoder`, `BytesUtils`, `HexUtils`, `ENSIP19`, `LibABI`, `LowLevelCallUtils`, `MigrationHelper`,
  insofar as a bug is reachable from a deployed contract.

Least important / out of scope:
- `contracts/**/mocks/`, `contracts/test/`, `utils/Test*.sol`, `DummyOracle`, `DummyAlgorithm`, `DummyDigest`,
  `TestRegistrar`, `FIFSRegistrar`: test scaffolding.
- `deploy/`, `scripts/`, `tasks/`, `deployments/`, `test/`, and configuration files. Immunefi excludes impacts on
  test and configuration files.
- Testnet deployments, unless the same code is (or is about to be) deployed on mainnet.

This repository's default branch (`staging`) can carry code that is not yet deployed. Say in each report whether the
affected contract is deployed, by name and network, using `deployments/<network>/<Contract>.json`. Rate undeployed
code by the impact it would have if deployed as written, and say clearly that it is undeployed.

## How to exercise it
- Build: `bun run compile` (Hardhat 3, solc 0.8.26, and 0.8.17 for `NameWrapper`). Solc is cached in the image; no
  network is needed.
- Tests: `bun run test` runs the whole vitest suite on Hardhat's in-process EDR network. Run one file with
  `bunx vitest run test/wrapper/TestNameWrapper.test.ts` (or similar); the agent machine has 2 CPUs, so prefer targeted
  runs.
- Shared deployment fixtures are under `test/fixtures/`. `*.remote.ts` tests fork mainnet and need an RPC URL; they
  will not work offline.
- Reproducers: write a vitest test under the relevant `test/<area>/` directory that deploys the affected contracts
  with the existing fixtures and asserts the bad outcome (eg, attacker becomes owner, fuse no longer burned, wrong
  address returned, ETH leaves the controller). Mainnet forks are not available, so reproduce against a local
  deployment configured like the one in `deployments/mainnet/`.
- Foundry (`forge`, `anvil`, `cast`) is installed if that is easier for a proof of concept.

## How you rate severity
Use the Immunefi Vulnerability Severity Classification System v2.3 for smart contracts, as the ENS program applies
it. In ENS terms, a name is an NFT, and its owner, resolver, records and fuses are what that NFT represents.

- **Critical**: direct theft of user funds (at rest or in motion), including ETH held by a registrar controller;
  direct theft of a name, or gaining control (owner, manager, resolver, records, subnames) of a name the attacker
  does not control; unauthorised minting or registration of a name, including registering without the required
  payment or commitment; permanent freezing of funds or of names (eg, a name that can no longer be renewed,
  transferred or unwrapped by its owner); unintended alteration of what a name represents, such as changing records
  or fuses, or making a victim's name resolve to attacker-chosen data through `UniversalResolver`; bypassing a
  burned fuse; forging a DNSSEC proof to claim or resolve a DNS name; forging or replaying a reverse (primary name)
  record for an address the attacker does not control; protocol insolvency.
- **High**: theft or permanent freezing of unclaimed yield or royalties; temporary freezing of
  funds or names, rated by value and duration.
- **Medium**: contract unable to operate as intended for some or all users (eg, registration, renewal, resolution
  or reverse resolution blocked for a set of names) without loss of funds; griefing that damages users or the
  protocol without profit to the attacker; theft of gas; unbounded gas consumption reachable by an attacker.
- **Low**: a contract fails to deliver promised returns without losing value; spec deviations (ENSIPs, EIP-137,
  EIP-3668, ERC-165, ERC-721, ERC-1155) with limited practical impact.
- An issue that needs a third-party system to fail (a CCIP-Read gateway, an L2 bridge or state proof, the Chainlink
  price feed) can be discounted by up to half; say what has to fail.
- Every report needs a runnable proof of concept, as Immunefi requires.

## Trust assumptions and anything to leave alone
- The ENS DAO and its executors are trusted. The DAO owns `Root` and the `.eth` registrar, can add or remove
  registrar controllers, and can upgrade `NameWrapper`. The Security Council and the `*SecurityController`
  contracts are trusted within their documented powers. Reports that require a malicious or compromised DAO,
  Security Council, ENS Labs or its operators, or leaked keys for a privileged address are out of scope unless the
  role can do something beyond its documented powers.
- Known issues, already reported and not eligible:
  1. A malicious DAO can steal names by upgrading `NameWrapper`.
  2. A malicious DAO can reduce the expiry of names.
  3. A `NameWrapper` race condition allows fuses to be set inappropriately.
- By design, not bugs: the owner of a parent node in the registry can take back an unwrapped (or wrapped but not
  emancipated) subname; registry ownership of an expired `.eth` name persists until someone reclaims it; records in
  `PublicResolver` survive ownership changes unless the new owner clears them with `clearRecords`; the old
  `RSASHA1Algorithm` and SHA-1 digests are still supported because DNS still uses them.
- Phishing, social engineering, front-end and metadata-service issues are out of scope for this enrolment.
- Patches: keep them minimal, in the existing style, with NatSpec on anything changed and a regression test next to
  the existing tests for that area. Deployed contracts cannot be changed in place, so say whether the fix needs a
  new deployment, a DAO action, or neither.
