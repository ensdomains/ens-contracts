const ENS = artifacts.require("./registry/ENSRegistry.sol");
const PublicResolver = artifacts.require("PublicResolver.sol");
const NameWrapper = artifacts.require("DummyNameWrapper.sol");
const UniversalResolver = artifacts.require("UniversalResolver.sol");
const DummyOffchainResolver = artifacts.require("DummyOffchainResolver.sol");
const DefaultReverseResolver = artifacts.require("DefaultReverseResolver.sol");
const ReverseRegistrar = artifacts.require("ReverseRegistrar.sol");

const { expect } = require("chai");
const namehash = require("eth-ens-namehash");
const sha3 = require("web3-utils").sha3;
const ethers = require("ethers");
const { dns } = require("../test-utils");

contract("UniversalResolver", function(accounts) {
  let ens,
    publicResolver,
    universalResolver,
    dummyOffchainResolver,
    nameWrapper,
    reverseResolver,
    reverseNode;

  beforeEach(async () => {
    node = namehash.hash("eth");
    ens = await ENS.new();
    nameWrapper = await NameWrapper.new();
    publicResolver = await PublicResolver.new(ens.address, nameWrapper.address);
    universalResolver = await UniversalResolver.new(ens.address);
    dummyOffchainResolver = await DummyOffchainResolver.new();
    reverseResolver = await DefaultReverseResolver.new(ens.address);
    reverseRegistrar = await ReverseRegistrar.new(
      ens.address,
      reverseResolver.address
    );
    reverseNode = accounts[0].toLowerCase().substring(2) + ".addr.reverse";

    await ens.setSubnodeOwner("0x0", sha3("eth"), accounts[0], {
      from: accounts[0],
    });
    await ens.setSubnodeOwner(namehash.hash("eth"), sha3("test"), accounts[0], {
      from: accounts[0],
    });
    await ens.setSubnodeOwner("0x0", sha3("reverse"), accounts[0], {
      from: accounts[0],
    });
    await ens.setSubnodeOwner(
      namehash.hash("reverse"),
      sha3("addr"),
      reverseRegistrar.address,
      { from: accounts[0] }
    );
    await ens.setResolver(namehash.hash("test.eth"), publicResolver.address, {
      from: accounts[0],
    });
    await ens.setSubnodeOwner(
      namehash.hash("test.eth"),
      sha3("sub"),
      accounts[0],
      { from: accounts[0] }
    );
    await ens.setResolver(namehash.hash("sub.test.eth"), accounts[1], {
      from: accounts[0],
    });
    await publicResolver.methods["setAddr(bytes32,address)"](
      namehash.hash("test.eth"),
      accounts[1],
      { from: accounts[0] }
    );
    await publicResolver.methods[
      "setText(bytes32,string,string)"
    ](namehash.hash("test.eth"), "foo", "bar", { from: accounts[0] });
    await ens.setSubnodeOwner(
      namehash.hash("test.eth"),
      sha3("offchain"),
      accounts[0],
      { from: accounts[0] }
    );
    await ens.setResolver(
      namehash.hash("offchain.test.eth"),
      dummyOffchainResolver.address,
      { from: accounts[0] }
    );

    await reverseRegistrar.claim(accounts[0], {
      from: accounts[0],
    });
    await ens.setResolver(namehash.hash(reverseNode), reverseResolver.address, {
      from: accounts[0],
    });
    await reverseResolver.setName(namehash.hash(reverseNode), "test.eth");
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
    it("should resolve a record via legacy methods", async () => {
      const data = (
        await publicResolver.methods["addr(bytes32)"].request(
          namehash.hash("test.eth")
        )
      ).data;
      const result = await universalResolver.resolve(
        dns.hexEncodeName("test.eth"),
        data
      );
      const [ret] = ethers.utils.defaultAbiCoder.decode(["address"], result);
      expect(ret).to.equal(accounts[1]);
    });

    it("should return a wrapped revert if the resolver reverts with OffchainData", async () => {
      const data = (
        await publicResolver.methods["addr(bytes32)"].request(
          namehash.hash("offchain.test.eth")
        )
      ).data;
      // OffchainLookup(address sender, string[] urls, bytes callData, bytes4 callbackFunction, bytes extraData)
      // This is the extraData value the universal resolver should encode
      const extraData = ethers.utils.defaultAbiCoder.encode(
        ["address", "bytes4", "bytes"],
        [dummyOffchainResolver.address, "0xb4a85801", data]
      );
      await expect(
        universalResolver.resolve(dns.hexEncodeName("offchain.test.eth"), data)
      ).to.be.revertedWith(
        "OffchainLookup(" +
          `"${universalResolver.address}", ` +
          '["https://example.com/"], ' +
          `"${data}", ` +
          '"0xb4a85801", ' +
          `"${extraData}"` +
          ")"
      );
    });
  });

  describe("resolveCallback()", () => {
    it("should handle callbacks by calling the original function", async () => {
      const data = (
        await publicResolver.methods["addr(bytes32)"].request(
          namehash.hash("offchain.test.eth")
        )
      ).data;
      // This is the extraData value the universal resolver creates for a call to the dummyOffchainResolver with the above data.
      const extraData = ethers.utils.defaultAbiCoder.encode(
        ["address", "bytes4", "bytes"],
        [dummyOffchainResolver.address, "0xb4a85801", data]
      );
      // The universalResolver passes the response (first argument) to the nested call, and DummyOffchainResolver expects it to be the same as the original calldata.
      const result = await universalResolver.resolveCallback(data, extraData);
      const [ret] = ethers.utils.defaultAbiCoder.decode(["address"], result);
      // The DummyOffchainResolver returns its own address as the result of all queries.
      expect(ret).to.equal(dummyOffchainResolver.address);
    });
  });

  describe("reverse()", () => {
    it("should resolve a reverse record with no calls", async () => {
      const result = await universalResolver.reverse(
        dns.hexEncodeName(reverseNode),
        []
      );
      expect(result["0"]).to.equal("test.eth");
    });
    it("should resolve a reverse record with 1 call with no arguments", async () => {
      const result = await universalResolver.reverse(
        dns.hexEncodeName(reverseNode),
        [
          {
            sig: "addr(bytes32)",
            data: [],
          },
        ]
      );
      const [ret] = ethers.utils.defaultAbiCoder.decode(
        ["address"],
        result["1"][0]
      );
      expect(result["0"]).to.equal("test.eth");
      expect(ret).to.equal(accounts[1]);
    });
    it("should resolve a reverse record with 1 call and arguments", async () => {
      const result = await universalResolver.reverse(
        dns.hexEncodeName(reverseNode),
        [
          {
            sig: "addr(bytes32,uint256)",
            data: [
              {
                dataType: "uint256",
                data: ethers.utils.defaultAbiCoder.encode(["uint256"], [60]),
              },
            ],
          },
        ]
      );
      const [ret] = ethers.utils.defaultAbiCoder.decode(
        ["bytes"],
        result["1"][0]
      );
      expect(result["0"]).to.equal("test.eth");
      expect(ret).to.equal(accounts[1].toLowerCase());
    });
    it("should resolve a reverse record with multiple calls and arguments", async () => {
      const result = await universalResolver.reverse(
        dns.hexEncodeName(reverseNode),
        [
          {
            sig: "addr(bytes32,uint256)",
            data: [
              {
                dataType: "uint256",
                data: ethers.utils.defaultAbiCoder.encode(["uint256"], [60]),
              },
            ],
          },
          {
            sig: "text(bytes32,string)",
            data: [
              {
                dataType: "string",
                data: ethers.utils.defaultAbiCoder.encode(["string"], ["foo"]),
              },
            ],
          },
        ]
      );
      const [addr] = ethers.utils.defaultAbiCoder.decode(
        ["bytes"],
        result["1"][0]
      );
      const [text] = ethers.utils.defaultAbiCoder.decode(
        ["string"],
        result["1"][1]
      );
      expect(result["0"]).to.equal("test.eth");
      expect(addr).to.equal(accounts[1].toLowerCase());
      expect(text).to.equal("bar");
    });
  });
  describe("encodeName()", () => {
    it("should encode a name", async () => {
      const result = await universalResolver.encodeName("vitalik.eth");
      expect(result).to.equal(dns.hexEncodeName("vitalik.eth"));
    });

    it("should encode an empty name", async () => {
      const result = await universalResolver.encodeName("");
      expect(result).to.equal(dns.hexEncodeName(""));
    });

    it("should encode a long name", async () => {
      const result = await universalResolver.encodeName(
        "something.else.test.eth"
      );
      expect(result).to.equal(dns.hexEncodeName("something.else.test.eth"));
    });
  });
});
