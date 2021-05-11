pragma solidity >=0.4.24;

// This file exists to persuade Truffle to compile contracts we need in tests
// that aren't referenced anywhere else.

import "@ensdomains/ens/contracts/ENSRegistry.sol";
import "@ensdomains/ens/contracts/ENSRegistryWithFallback.sol";
import "@ensdomains/ens/contracts/HashRegistrar.sol";
import "@ensdomains/subdomain-registrar/contracts/EthRegistrarSubdomainRegistrar.sol";
import "@ensdomains/subdomain-registrar/contracts/ENSMigrationSubdomainRegistrar.sol";
