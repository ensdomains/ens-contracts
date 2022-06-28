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
    const arg1 = 6
    const arg2 = 7
    const arg3 = 2 // offchain
    // const arg4 = 7
    let result, callData, extraData
    let arg1result, arg2result, arg3result, arg4result
    let r
    console.log('***1')
    try{
      await fixtureResolver.callStatic.multicall([
        fixtureResolver.interface.encodeFunctionData('doSomethingOffchain', [arg1]),
        fixtureResolver.interface.encodeFunctionData('doSomethingOffchain', [arg2]),
        // fixtureResolver.interface.encodeFunctionData('doSomethingOffchain', [arg3]),
        // fixtureResolver.interface.encodeFunctionData('doSomethingOffchain', [arg4])
      ])
      console.log('***1.1')
    }catch(e){
      console.log({e})
      // const urls = e.errorArgs.urls
      // assert.equal(urls[0], batchgatewayurl);
      callData = e.errorArgs.callData
      extraData = e.errorArgs.extraData
      result = iface.decodeFunctionData("query", callData);
      console.log({result})
      arg1result = result[0][0]
      arg2result = result[0][1]
      // const arg3result = result[0][2]
      // const arg4result = result[0][3]
      console.log(JSON.stringify(result, undefined, 2))
      // assert.equal(result[0].length, 4);
      assert.equal(arg1result[0][0], gatewayurl);
      assert.equal(fixtureResolver.interface.decodeFunctionData("doSomethingOffchain", arg1result[1])[0].toNumber(), arg1)
      // assert.equal(arg2result[0][0], gatewayurl);
      // assert.equal(fixtureResolver.interface.decodeFunctionData("doSomethingOffchain", arg2result[1])[0].toNumber(), arg2)
      // assert.equal(arg3result[0][0], undefined);
      // assert.equal(arg3result[1], "0x")
      // assert.equal(arg4result[0][0], gatewayurl);
      // assert.equal(fixtureResolver.interface.decodeFunctionData("doSomethingOffchain", arg4result[1])[0].toNumber(), arg4)
    }

    try{
      console.log('***2', {arg1result})
      // Gateway doubles the input data
      // const input =  iface.encodeFunctionResult("query", [[1, 1, 0, 1]])
      const decodedResposnse = fixtureResolver.interface.decodeFunctionData("doSomethingOffchain", arg1result.callData)[0].toNumber()
      const decodedResposnse2 = fixtureResolver.interface.decodeFunctionData("doSomethingOffchain", arg2result.callData)[0].toNumber()
      console.log({decodedResposnse, decodedResposnse2})
      console.log({decodedResposnse})
      const encoded = ethers.utils.defaultAbiCoder.encode(['uint256'], [
        [decodedResposnse]
      ])
      const encoded2 = ethers.utils.defaultAbiCoder.encode(['uint256'], [
        [decodedResposnse2]
      ])

      console.log('***2.1')
      // const decoded = ethers.utils.defaultAbiCoder.decode([ 'uint256[]' ], encoded);
      console.log('***2.2')
      console.log({encoded, extraData})
      // console.log({encoded, decoded, extraData})
      const input =  iface.encodeFunctionResult("query", [[
        encoded, encoded2
      ]])
      console.log('***3', input)
      const response = await fixtureResolver.callStatic.multicallCallback(
        input , extraData
      )
      assert.equal(fixtureResolver.interface.decodeFunctionResult("doSomethingOffchainCallback", response[0])[0].toNumber(), arg1)
      assert.equal(fixtureResolver.interface.decodeFunctionResult("doSomethingOffchainCallback", response[1])[0].toNumber(), arg2)
      // console.log('***4', {decodedCallbackResposnse})
      // console.log({response})
    }catch(e){
      console.log('***5')
      console.log({e})
    }
  });
});
