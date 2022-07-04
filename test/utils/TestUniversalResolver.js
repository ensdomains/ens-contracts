const { deploy } = require("../test-utils/contracts")
const { expect } = require("chai");
const namehash = require("eth-ens-namehash");
const sha3 = require("web3-utils").sha3;
const { ethers } = require("hardhat");
const { dns } = require("../test-utils");
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

contract("UniversalResolver", function() {
  let 
    accounts,
    ens,
    publicResolver,
    universalResolver,
    dummyOffchainResolver,
    nameWrapper,
    reverseRegistrar,
    reverseNode;

  beforeEach(async () => {
    const signers = await ethers.getSigners()
    accounts = [
      await signers[0].getAddress(),
      await signers[1].getAddress()
    ]
    node = namehash.hash("eth");
    ens = await deploy("ENSRegistry");
    nameWrapper = await deploy(
      "NameWrapper",
      ens.address,
      ZERO_ADDRESS,
      ZERO_ADDRESS
    )
    publicResolver = await deploy("PublicResolver",
      ens.address,
      nameWrapper.address,
      ZERO_ADDRESS,
      ZERO_ADDRESS
    );
    dummyOffchainResolver = await deploy("DummyOffchainResolver");
    reverseRegistrar = await deploy("ReverseRegistrar", ens.address);
    reverseNode = accounts[0].toLowerCase().substring(2) + ".addr.reverse";
    universalResolver = await deploy("UniversalResolver", ens.address);
    await ens.setSubnodeOwner(namehash.hash(""), sha3("eth"), accounts[0]);
    await ens.setSubnodeOwner(namehash.hash("eth"), sha3("test"), accounts[0]);
    await ens.setSubnodeOwner(namehash.hash(""), sha3("reverse"), accounts[0]);
    await ens.setSubnodeOwner(
      namehash.hash("reverse"),
      sha3("addr"),
      reverseRegistrar.address
    );
    await ens.setResolver(namehash.hash("test.eth"), publicResolver.address);
    await ens.setSubnodeOwner(
      namehash.hash("test.eth"),
      sha3("sub"),
      accounts[0]
    );
    await ens.setResolver(namehash.hash("sub.test.eth"), accounts[1]);
    await publicResolver["setAddr(bytes32,address)"](
      namehash.hash("test.eth"),
      accounts[1]
    );
    await publicResolver[
      "setText(bytes32,string,string)"
    ](namehash.hash("test.eth"), "foo", "bar");
    await ens.setSubnodeOwner(
      namehash.hash("test.eth"),
      sha3("offchain"),
      accounts[0]
    );
    await ens.setResolver(
      namehash.hash("offchain.test.eth"),
      dummyOffchainResolver.address
    );
    await reverseRegistrar.claim(accounts[0]);
    await ens.setResolver(namehash.hash(reverseNode), publicResolver.address);
    await publicResolver.setName(namehash.hash(reverseNode), "test.eth");
  });

  describe("findResolver()", () => {
    it("should find an exact match resolver", async () => {
      const result = await universalResolver.findResolver(
        dns.hexEncodeName("test.eth")
      );
      expect(result["0"]).to.equal(publicResolver.address);
    });

    it("should find a resolver on a parent name", async () => {
      const result = await universalResolver.findResolver(
        dns.hexEncodeName("foo.test.eth")
      );
      expect(result["0"]).to.equal(publicResolver.address);
    });

    it("should choose the resolver closest to the leaf", async () => {
      const result = await universalResolver.findResolver(
        dns.hexEncodeName("sub.test.eth")
      );
      expect(result["0"]).to.equal(accounts[1]);
    });
  });

  describe("resolve()", () => {
    it("should resolve a record if `supportsInterface` throws", async () => {
      const legacyResolver = await deploy("LegacyResolver");
      await ens.setSubnodeOwner(
        namehash.hash("eth"),
        sha3("test2"),
        accounts[0],
        { from: accounts[0] }
      );
      await ens.setResolver(
        namehash.hash("test2.eth"),
        legacyResolver.address,
        { from: accounts[0] }
      );
      const data = legacyResolver.interface.encodeFunctionData("addr(bytes32)", [namehash.hash("test.eth")])
      const result = await universalResolver.resolve(
        dns.hexEncodeName("test2.eth"),
        data
      );
      const [ret] = ethers.utils.defaultAbiCoder.decode(
        ["address"],
        result["0"]
      );
      expect(ret).to.equal(legacyResolver.address);
    });

    it("should resolve a record via legacy methods", async () => {
      const data = publicResolver.interface.encodeFunctionData("addr(bytes32)", [namehash.hash("test.eth")])
      const result = await universalResolver.resolve(
        dns.hexEncodeName("test.eth"),
        data
      );
      const [ret] = ethers.utils.defaultAbiCoder.decode(
        ["address"],
        result["0"]
      );
      expect(ret).to.equal(accounts[1]);
    });

    it("should return a wrapped revert if the resolver reverts with OffchainData", async () => {
      const data = publicResolver.interface.encodeFunctionData("addr(bytes32)", [namehash.hash("offchain.test.eth")])
      // "0xb4a85801"
      const callbackFunction =  ethers.utils.hexDataSlice(ethers.utils.id("resolveCallback(bytes,bytes)"),0,4)
      // OffchainLookup(address sender, string[] urls, bytes callData, bytes4 callbackFunction, bytes extraData)
      // This is the extraData value the universal resolver should encode
      const extraData = ethers.utils.defaultAbiCoder.encode(["address", "bytes4", "bytes"], [dummyOffchainResolver.address, callbackFunction, data]);
      try{
        await universalResolver.callStatic.resolve(dns.hexEncodeName("offchain.test.eth"), data)
      }catch(e){
        expect(e.errorName).to.equal("OffchainLookup");
        expect(e.errorArgs.sender).to.equal(universalResolver.address);
        expect(e.errorArgs.urls.length).to.equal(1);
        expect(e.errorArgs.urls[0]).to.equal("https://example.com/");
        expect(e.errorArgs.callData).to.equal(data);
        expect(e.errorArgs.callbackFunction).to.equal(callbackFunction);
        expect(e.errorArgs.extraData).to.equal(extraData);
      }
    });
  });

  describe("reverse()", () => {
    it("should resolve a reverse record with name and resolver address", async () => {
      const estimate =  await universalResolver.estimateGas.reverse(dns.hexEncodeName(reverseNode))
      const result = await universalResolver.reverse(dns.hexEncodeName(reverseNode))
      console.log("GAS ESTIMATE:", estimate);
      expect(result["0"]).to.equal("test.eth");
      expect(result["1"]).to.equal(accounts[1]);
      expect(result["2"]).to.equal(publicResolver.address);
      expect(result["3"]).to.equal(publicResolver.address);
    });
  });
});
