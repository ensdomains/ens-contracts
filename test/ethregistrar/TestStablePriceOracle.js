const ENS = artifacts.require('./registry/ENSRegistry');
const BaseRegistrar = artifacts.require('./BaseRegistrarImplementation');
const DummyOracle = artifacts.require('./DummyOracle');
const StablePriceOracle = artifacts.require('./StablePriceOracle');

const namehash = require('eth-ens-namehash');
const sha3 = require('web3-utils').sha3;
const toBN = require('web3-utils').toBN;

contract('StablePriceOracle', function (accounts) {
    let priceOracle;

    before(async () => {
        ens = await ENS.new();
        registrar = await BaseRegistrar.new(ens.address, namehash.hash('eth'));

        // Dummy oracle with 1 ETH == 10 USD
        var dummyOracle = await DummyOracle.new(toBN(1000000000));
        // 4 attousd per second for 3 character names, 2 attousd per second for 4 character names,
        // 1 attousd per second for longer names.
        priceOracle = await StablePriceOracle.new(dummyOracle.address, [0, 0, 4, 2, 1]);
    });

    it('should return correct prices', async () => {
        assert.equal((await priceOracle.price("foo", 0, 3600)).toNumber(), 1440);
        assert.equal((await priceOracle.price("quux", 0, 3600)).toNumber(), 720);
        assert.equal((await priceOracle.price("fubar", 0, 3600)).toNumber(), 360);
        assert.equal((await priceOracle.price("foobie", 0, 3600)).toNumber(), 360);
    });

    it('should work with larger values', async () => {
        // 1 USD per second!
        await priceOracle.setPrices([toBN("1000000000000000000")]);
        assert.equal((await priceOracle.price("foo", 0, 86400)).toString(), "8640000000000000000000");
    })
});
