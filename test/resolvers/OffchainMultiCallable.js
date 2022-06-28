const { assert } = require("chai");
const { ethers } = require("hardhat");
const batchGatewayAbi = require('../../artifacts/contracts/utils/OffchainMulticallable.sol/BatchGateway.json').abi
const iface = new ethers.utils.Interface(batchGatewayAbi); 
const batchgatewayurl = "http://batchgateway.com/";
const gatewayurl = "http://gateway.com/";

describe.only("Multicall", function () {
  it("returns onchain data", async function () {
    const MulticallTestFixture = await ethers.getContractFactory("MulticallTestFixture");
    const fixtureResolver = await MulticallTestFixture.deploy([batchgatewayurl], [gatewayurl]);
    await fixtureResolver.deployed();
    const arg1 = 2 // anything below 5 is offchain
    const arg2 = 2 // anything below 5 is offchain
    const args = [
      fixtureResolver.interface.encodeFunctionData('doSomethingOffchain', [arg1]),
      fixtureResolver.interface.encodeFunctionData('doSomethingOffchain', [arg2])
    ]
    const result = await fixtureResolver.callStatic.multicall(args)
    assert.equal(result.length, args.length);
    assert.equal(fixtureResolver.interface.decodeFunctionResult('doSomethingOffchain', result[0])[0].toNumber(), arg1);
    assert.equal(fixtureResolver.interface.decodeFunctionResult('doSomethingOffchain', result[1])[0].toNumber(), arg2);
  })

  it("returns onchain and offchain data", async function () {
    const MulticallTestFixture = await ethers.getContractFactory("MulticallTestFixture");
    const fixtureResolver = await MulticallTestFixture.deploy([batchgatewayurl], [gatewayurl]);
    await fixtureResolver.deployed();
    const arg1 = 6
    const arg2 = 2 // anything below 5 is offchain
    const arg3 = 7 
    let result, callData, extraData
    let arg1result, arg3result
    const args = [
      fixtureResolver.interface.encodeFunctionData('doSomethingOffchain', [arg1]),
      fixtureResolver.interface.encodeFunctionData('doSomethingOffchain', [arg2]), // offchain
      fixtureResolver.interface.encodeFunctionData('doSomethingOffchain', [arg3])
    ]
    try{
      await fixtureResolver.callStatic.multicall(args)
    }catch(e){
      const urls = e.errorArgs.urls
      assert.equal(urls[0], batchgatewayurl);
      callData = e.errorArgs.callData
      extraData = e.errorArgs.extraData
      result = iface.decodeFunctionData("query", callData);
      arg1result = result[0][0]
      arg3result = result[0][1]
      assert.equal(result[0].length, args.length - 1); // do not count offchain records
      assert.equal(arg1result[0][0], gatewayurl);
      assert.equal(fixtureResolver.interface.decodeFunctionData("doSomethingOffchain", arg1result[1])[0].toNumber(), arg1)
      assert.equal(arg3result[0][0], gatewayurl);
      assert.equal(fixtureResolver.interface.decodeFunctionData("doSomethingOffchain", arg3result[1])[0].toNumber(), arg3)
    }

    try{
      const encoded = ethers.utils.defaultAbiCoder.encode(['uint256'], [
        [fixtureResolver.interface.decodeFunctionData("doSomethingOffchain", arg1result.callData)[0].toNumber()]
      ])
      const encoded3 = ethers.utils.defaultAbiCoder.encode(['uint256'], [
        [fixtureResolver.interface.decodeFunctionData("doSomethingOffchain", arg3result.callData)[0].toNumber()]
      ])
      const input =  iface.encodeFunctionResult("query", [[
        encoded, encoded3
      ]])
      const response = await fixtureResolver.callStatic.multicallCallback(
        input , extraData
      )
      assert.equal(fixtureResolver.interface.decodeFunctionResult("doSomethingOffchainCallback", response[0])[0].toNumber(), arg1)
      assert.equal(fixtureResolver.interface.decodeFunctionResult("doSomethingOffchainCallback", response[1])[0].toNumber(), arg2)
      assert.equal(fixtureResolver.interface.decodeFunctionResult("doSomethingOffchainCallback", response[2])[0].toNumber(), arg3)
    }catch(e){
      console.log({e})
    }
  });
});
