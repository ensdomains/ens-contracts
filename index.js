const BaseRegistrarImplementation = require('./build/contracts/BaseRegistrarImplementation')
const BulkRenewal = require('./build/contracts/BulkRenewal')
const ENS = require('./build/contracts/ENS')
const ENSRegistry = require('./build/contracts/ENSRegistry')
const ENSRegistryWithFallback = require('./build/contracts/ENSRegistryWithFallback')
const ExponentialPremiumPriceOracle = require('./build/contracts/ExponentialPremiumPriceOracle')
const ETHRegistrarController = require('./build/contracts/ETHRegistrarController')
const FIFSRegistrar = require('./build/contracts/FIFSRegistrar')
const IBaseRegistrar = require('./build/contracts/IBaseRegistrar')
const IPriceOracle = require('./build/contracts/IPriceOracle')
const LinearPremiumPriceOracle = require('./build/contracts/LinearPremiumPriceOracle')
const PublicResolver = require('./build/contracts/PublicResolver')
const Resolver = require('./build/contracts/Resolver')
const ReverseRegistrar = require('./build/contracts/ReverseRegistrar')
const TestRegistrar = require('./build/contracts/TestRegistrar')
const StablePriceOracle = require('./build/contracts/StablePriceOracle')
const DNSRegistrar = require('./build/contracts/DNSRegistrar')
const PublicSuffixList = require('./build/contracts/PublicSuffixList')
const SimplePublicSuffixList = require('./build/contracts/SimplePublicSuffixList')
const TLDPublicSuffixList = require('./build/contracts/TLDPublicSuffixList')

const Root = require('./build/contracts/Root')
const DNSSEC = require('./build/contracts/DNSSEC')
const RSASHA256Algorithm = require('./build/contracts/RSASHA256Algorithm')
const RSASHA1Algorithm = require('./build/contracts/RSASHA1Algorithm')
const SHA256Digest = require('./build/contracts/SHA256Digest')
const SHA1Digest = require('./build/contracts/SHA1Digest')

module.exports = {
  BaseRegistrarImplementation,
  BulkRenewal,
  ENS,
  ENSRegistry,
  ENSRegistryWithFallback,
  ExponentialPremiumPriceOracle,
  ETHRegistrarController,
  FIFSRegistrar,
  IBaseRegistrar,
  IPriceOracle,
  LinearPremiumPriceOracle,
  PublicResolver,
  Resolver,
  ReverseRegistrar,
  StablePriceOracle,
  TestRegistrar,
  DNSRegistrar,
  PublicSuffixList,
  SimplePublicSuffixList,
  TLDPublicSuffixList,
  Root,
  DNSSEC,
  RSASHA256Algorithm,
  RSASHA1Algorithm,
  SHA256Digest,
  SHA1Digest,
}
