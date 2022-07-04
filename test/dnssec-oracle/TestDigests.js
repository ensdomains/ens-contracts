const digests = require('./data/digests');
const { expectRevert } = require('@openzeppelin/test-helpers');
const { ethers } = require("hardhat");

digests.forEach(function(testcase) {
  contract(testcase.digest, function(accounts) {
    const algorithm = artifacts.require('./digests/' + testcase.digest + '.sol');
    let instance
    beforeEach(async () => {
      const Contract = await ethers.getContractFactory(testcase.digest);
      var deployed = await algorithm.deployed();
      // web3.js contract is not throwing an error when "throwOnCallFailures:true" is enabled
      // To work around, it is re-instanciating with ethers.js contract
      instance = Contract.attach(deployed.address)
    });

    it('should return true for valid hashes', async function() {
      await Promise.all(testcase.valids.map(async function([text, digest]) {
        assert.equal(await instance.verify(ethers.utils.hexlify(ethers.utils.toUtf8Bytes(text)), digest), true);
      }));
    });

    it('should return false for invalid hashes', async function() {
      await Promise.all(testcase.invalids.map(async function([text, digest]) {
        assert.equal(await instance.verify(ethers.utils.hexlify(ethers.utils.toUtf8Bytes(text)), digest), false);
      }));
    });

    it('should throw an error for hashes of the wrong form', async function() {
      await Promise.all(testcase.errors.map(async function([text, digest]) {
        await expectRevert.unspecified(instance.verify(ethers.utils.hexlify(ethers.utils.toUtf8Bytes(text)), digest));
      }));
    });
  });
});
