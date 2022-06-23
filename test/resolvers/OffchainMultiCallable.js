const { assert } = require("chai");
const { ethers } = require("hardhat");
const batchGatewayAbi = require('../../artifacts/contracts/utils/OffchainMulticallable.sol/BatchGateway.json').abi
const iface = new ethers.utils.Interface(batchGatewayAbi);

describe("Multicall", function () {
  it("allows reading multiple fields", async function () {
    const batchgatewayurl = "http://batchgateway.com/";
    const gatewayurl = "http://gateway.com/";
    const MulticallTestFixture = await ethers.getContractFactory("MulticallTestFixture");
    const fixtureResolver = await MulticallTestFixture.deploy([batchgatewayurl], [gatewayurl]);
    await fixtureResolver.deployed();
    const arg1 = 1
    const arg2 = 2
    const arg3 = 3
    try{
      await fixtureResolver.callStatic.multicall([
        fixtureResolver.interface.encodeFunctionData('doSomethingOffchain', [arg1]),
        fixtureResolver.interface.encodeFunctionData('doSomethingOffchain', [arg2]),
        fixtureResolver.interface.encodeFunctionData('doSomethingOffchain', [arg3])
      ])
      }catch(e){
        const urls = e.errorArgs.urls
        assert.equal(urls[0], batchgatewayurl);
        const callData = e.errorArgs.callData
        const result = iface.decodeFunctionData("query", callData);
        const arg1result = result[0][0]
        const arg2result = result[0][1]
        const arg3result = result[0][2]
        assert.equal(arg1result[0][0], gatewayurl);
        assert.equal(fixtureResolver.interface.decodeFunctionData("doSomethingOffchain", arg1result[1])[0].toNumber(), arg1)
        assert.equal(arg2result[0][0], gatewayurl);
        assert.equal(fixtureResolver.interface.decodeFunctionData("doSomethingOffchain", arg2result[1])[0].toNumber(), arg2)
        assert.equal(arg3result[0][0], gatewayurl);
        assert.equal(fixtureResolver.interface.decodeFunctionData("doSomethingOffchain", arg3result[1])[0].toNumber(), arg3)
      }
  });
});