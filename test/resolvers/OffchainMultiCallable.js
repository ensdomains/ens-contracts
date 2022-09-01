const { assert } = require("chai");
const { ethers } = require("hardhat");
const { shouldSupportInterfaces } = require('../wrapper/SupportsInterface.behaviour');
const batchGatewayAbi = require('../../artifacts/contracts/utils/OffchainMulticallable.sol/BatchGateway.json').abi
const iface = new ethers.utils.Interface(batchGatewayAbi); 
const batchgatewayurl = "http://batchgateway.com/";
const gatewayurl = "http://gateway.com/";
let MulticallTestFixture, fixtureResolver

describe("Multicall", function () {
  before(async () => {
    MulticallTestFixture = await ethers.getContractFactory("MulticallTestFixture");
    fixtureResolver = await MulticallTestFixture.deploy([batchgatewayurl], [gatewayurl]);
    await fixtureResolver.deployed();
  })

  it("returns onchain data", async function () {
    const arg1 = 2 // anything below 5 is offchain
    const arg2 = 2 // anything below 5 is offchain
    const args = [arg1, arg2]
    const encodedArgs = args.map(arg => fixtureResolver.interface.encodeFunctionData('doSomethingOffchain', [arg]))
    const result = await fixtureResolver.callStatic.multicall(encodedArgs)
    assert.equal(result.length, args.length);
    assert.equal(fixtureResolver.interface.decodeFunctionResult('doSomethingOffchain', result[0])[0].toNumber(), arg1);
    assert.equal(fixtureResolver.interface.decodeFunctionResult('doSomethingOffchain', result[1])[0].toNumber(), arg2);
  })

  it("returns onchain and offchain data recursively", async function () {
    const threashold = 5
    const arg1 = 6
    const arg2 = 2 // anything below 5 is offchain
    const arg3 = 7
    const args = [arg1, arg2, arg3]
    let result, callData, extraData
    let arg1result, arg3result
    const encodedArgs = args.map(arg => fixtureResolver.interface.encodeFunctionData('doSomethingOffchain', [arg]))
    try{
      await fixtureResolver.callStatic.multicall(encodedArgs)
    }catch(e){
      const urls = e.errorArgs.urls
      assert.equal(urls[0], batchgatewayurl);
      callData = e.errorArgs.callData
      extraData = e.errorArgs.extraData
      result = iface.decodeFunctionData("query", callData);
      arg1result = result[0][0]
      arg3result = result[0][1]
      assert.equal(result[0].length, args.length - 1); // do not count offchain records
      assert.equal(arg1result.urls[0], gatewayurl);
      assert.equal(arg1result.originalSender, fixtureResolver.address);
      assert.equal(fixtureResolver.interface.decodeFunctionData("doSomethingOffchain", arg1result.callData)[0].toNumber(), arg1)
      assert.equal(arg3result.urls[0], gatewayurl);
      assert.equal(arg3result.originalSender, fixtureResolver.address);
      assert.equal(fixtureResolver.interface.decodeFunctionData("doSomethingOffchain", arg3result.callData)[0].toNumber(), arg3)
    }

    const recursiveTest = async function (result, extraData){
      try{
        const encoded = result[0].map(r => {
          return ethers.utils.defaultAbiCoder.encode(['uint256'], [
            [fixtureResolver.interface.decodeFunctionData("doSomethingOffchain", r.callData)[0].toNumber()]
          ])
        })
        const input =  iface.encodeFunctionResult("query", [encoded])
        const response = await fixtureResolver.callStatic.multicallCallback(
          input , extraData
        )
        assert.equal(fixtureResolver.interface.decodeFunctionResult("doSomethingOffchainCallback", response[0])[0].toNumber(), threashold);
        assert.equal(fixtureResolver.interface.decodeFunctionResult("doSomethingOffchainCallback", response[1])[0].toNumber(), arg2);
        assert.equal(fixtureResolver.interface.decodeFunctionResult("doSomethingOffchainCallback", response[2])[0].toNumber(), threashold);        
      }catch(e){
        if(e.errorName === 'OffchainLookup'){
          await recursiveTest(
            iface.decodeFunctionData("query", e.errorArgs.callData),
            e.errorArgs.extraData
          )
        }else{
          assert.fail('should not come here')
        }
      }  
    }
    await recursiveTest(result, extraData)
  });

  shouldSupportInterfaces(() => fixtureResolver, ['IOffchainMulticallable'])
});
