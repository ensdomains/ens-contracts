// Canonical Sepolia PublicResolver config.
//
// Defensive fix for https://github.com/ensdomains/ens-contracts/issues/502
// ("Update ENS Name Registration to Use Latest Public Resolver on Sepolia").
//
// Problem (Nov 2025, open, unassigned, no linked PRs): new Sepolia
// registrations were observed defaulting to a stale resolver
// (0x8FADE66B79cC9f707aB26799354482EB93a5B7dD) instead of the documented
// Sepolia PublicResolver (0xE99638b40E4Fff0129D56f03b55b6bbC4BBE49b5,
// see https://docs.ens.domains/learn/deployments and
// deployments/sepolia/PublicResolver.json in this repo).
//
// This file is the single deployment-config source of truth for "which
// resolver should new Sepolia registrations point at". Testnet/devEx only.
// It is intentionally config-only so it stays complementary to TateB's
// draft #537 (sepolia-dev deployment + rocketh bump), which touches deploy
// scripts and a separate sepolia-dev network — not this mapping.
//
// Gap note: local checkout is behind upstream (upstream HEAD reported as
// 121dc23 at scoping time). This branch is cut from local tag v1.7.0 and
// deliberately NOT rebased; re-check addresses against upstream/docs before
// opening a PR.

/// Sepolia chain id (viem `sepolia.id`).
export const SEPOLIA_CHAIN_ID = 11155111 as const

/// Documented canonical Sepolia PublicResolver. New registrations must use this.
export const SEPOLIA_PUBLIC_RESOLVER =
  '0xE99638b40E4Fff0129D56f03b55b6bbC4BBE49b5' as const

/// Stale resolver observed in issue #502. Kept here only as a regression
/// guard — never use as a default.
export const SEPOLIA_STALE_PUBLIC_RESOLVER =
  '0x8FADE66B79cC9f707aB26799354482EB93a5B7dD' as const

/// Reference docs for the canonical address above.
export const SEPOLIA_RESOLVER_DOCS_URL =
  'https://docs.ens.domains/learn/deployments' as const

/// Local deployment artifact this config must stay in sync with.
export const SEPOLIA_PUBLIC_RESOLVER_ARTIFACT =
  'deployments/sepolia/PublicResolver.json' as const
