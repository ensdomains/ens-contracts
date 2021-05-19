const BaseRegistrar = require('./build/contracts/BaseRegistrar')
const BaseRegistrarImplementation = require('./build/contracts/BaseRegistrarImplementation')
const BulkRenewal = require('./build/contracts/BulkRenewal')
const ENS = require('./build/contracts/ENS')
const ENSRegistry = require('./build/contracts/ENSRegistry')
const ENSRegistryWithFallback = require('./build/contracts/ENSRegistryWithFallback')
const ETHRegistrarController = require('./build/contracts/ETHRegistrarController')
const FIFSRegistrar = require('./build/contracts/FIFSRegistrar')
const LinearPremiumPriceOracle = require('./build/contracts/LinearPremiumPriceOracle')
const PriceOracle = require('./build/contracts/PriceOracle')
const PublicResolver = require('./build/contracts/PublicResolver')
const Resolver = require('./build/contracts/Resolver')
const ReverseRegistrar = require('./build/contracts/ReverseRegistrar')
const TestRegistrar = require('./build/contracts/TestRegistrar')
const StablePriceOracle  = require('./build/contracts/StablePriceOracle')

module.exports = {
  BaseRegistrar,
  BaseRegistrarImplementation,
  BulkRenewal,
  ENS,
  ENSRegistry,
  ENSRegistryWithFallback,
  ETHRegistrarController,
  FIFSRegistrar,
  LinearPremiumPriceOracle,
  PriceOracle,
  PublicResolver,
  Resolver,
  ReverseRegistrar,
  StablePriceOracle,
  TestRegistrar
}
