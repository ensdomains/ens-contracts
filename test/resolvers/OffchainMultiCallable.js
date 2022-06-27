const { assert } = require("chai");
const { ethers } = require("hardhat");
const batchGatewayAbi = require('../../artifacts/contracts/utils/OffchainMulticallable.sol/BatchGateway.json').abi
const iface = new ethers.utils.Interface(batchGatewayAbi); 
const batchgatewayurl = "http://batchgateway.com/";
const gatewayurl = "http://gateway.com/";

describe("Multicall", function () {
  it("returns onchain data", async function () {
    const MulticallTestFixture = await ethers.getContractFactory("MulticallTestFixture");
    const fixtureResolver = await MulticallTestFixture.deploy([batchgatewayurl], [gatewayurl]);
    await fixtureResolver.deployed();
    const arg1 = 10
    const arg2 = 11
    const result = await fixtureResolver.callStatic.multicall([
      fixtureResolver.interface.encodeFunctionData('doSomethingOffchain', [arg1]),
      fixtureResolver.interface.encodeFunctionData('doSomethingOffchain', [arg2])
    ])
    assert.equal(result.length, 2);
    assert.equal(fixtureResolver.interface.decodeFunctionResult('doSomethingOffchain', result[0])[0].toNumber(), arg1);
    assert.equal(fixtureResolver.interface.decodeFunctionResult('doSomethingOffchain', result[1])[0].toNumber(), arg2);
  })

  it.only("allows reading multiple fields", async function () {
    const MulticallTestFixture = await ethers.getContractFactory("MulticallTestFixture");
    const fixtureResolver = await MulticallTestFixture.deploy([batchgatewayurl], [gatewayurl]);
    await fixtureResolver.deployed();
    const arg1 = 11
    const arg2 = 12
    const arg3 = 2 // offchain
    const arg4 = 14
    let result, callData, extraData
    let r
    console.log('***1')
    try{
      await fixtureResolver.callStatic.multicall([
        fixtureResolver.interface.encodeFunctionData('doSomethingOffchain', [arg1]),
        // fixtureResolver.interface.encodeFunctionData('doSomethingOffchain', [arg2]),
        // fixtureResolver.interface.encodeFunctionData('doSomethingOffchain', [arg3]),
        // fixtureResolver.interface.encodeFunctionData('doSomethingOffchain', [arg4])
      ])
    }catch(e){
      console.log({e})
      // const urls = e.errorArgs.urls
      // assert.equal(urls[0], batchgatewayurl);
      callData = e.errorArgs.callData
      extraData = e.errorArgs.extraData
      result = iface.decodeFunctionData("query", callData);
      // const arg1result = result[0][0]
      // const arg2result = result[0][1]
      // const arg3result = result[0][2]
      // const arg4result = result[0][3]
      // console.log(JSON.stringify(result, undefined, 2))
      // assert.equal(result[0].length, 4);
      // assert.equal(arg1result[0][0], gatewayurl);
      // assert.equal(fixtureResolver.interface.decodeFunctionData("doSomethingOffchain", arg1result[1])[0].toNumber(), arg1)
      // assert.equal(arg2result[0][0], gatewayurl);
      // assert.equal(fixtureResolver.interface.decodeFunctionData("doSomethingOffchain", arg2result[1])[0].toNumber(), arg2)
      // assert.equal(arg3result[0][0], undefined);
      // assert.equal(arg3result[1], "0x")
      // assert.equal(arg4result[0][0], gatewayurl);
      // assert.equal(fixtureResolver.interface.decodeFunctionData("doSomethingOffchain", arg4result[1])[0].toNumber(), arg4)
    }

    try{
      console.log('***2')
      // Gateway doubles the input data
      // const input =  iface.encodeFunctionResult("query", [[1, 1, 0, 1]])
      const input =  iface.encodeFunctionResult("query", [[2]])
      console.log('***3')
      const response = await fixtureResolver.callStatic.multicallCallback(
        input , extraData
      )
      console.log('***4')
      console.log({response})
    }catch(e){
      console.log('***5')
      console.log({e})
    }
  });
});
