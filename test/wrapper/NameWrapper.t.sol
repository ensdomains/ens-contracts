// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

import "forge-std/Test.sol";
import "../../contracts/registry/ENSRegistry.sol";
import "../../contracts/ethregistrar/BaseRegistrarImplementation.sol";
import "../../contracts/ethregistrar/DummyOracle.sol";
import "../../contracts/wrapper/StaticMetadataService.sol";
import "../../contracts/wrapper/IMetadataService.sol";
import "../../contracts/wrapper/NameWrapper.sol";

import {NameEncoder} from "../../contracts/utils/NameEncoder.sol";
import {ReverseRegistrar} from "../../contracts/registry/ReverseRegistrar.sol";
import {AggregatorInterface, StablePriceOracle} from "../../contracts/ethregistrar/StablePriceOracle.sol";
import {ETHRegistrarController, IETHRegistrarController} from "../../contracts/ethregistrar/ETHRegistrarController.sol";

contract NameWrapperTest is Test {
    ENSRegistry public registry;
    BaseRegistrarImplementation public baseRegistrar;
    StaticMetadataService public metadata;
    NameWrapper public wrapper;
    IETHRegistrarController public controller;

    address EMPTY_ADDRESS = 0x0000000000000000000000000000000000000000;
    bytes32 ROOT_NODE =
        0x0000000000000000000000000000000000000000000000000000000000000000;

    function setUp() public {
        address alice = vm.addr(1);
        registry = new ENSRegistry();

        (, bytes32 namehash) = NameEncoder.dnsEncodeName("eth");

        baseRegistrar = new BaseRegistrarImplementation(registry, namehash);
        metadata = new StaticMetadataService("https://ens.domains");
        IMetadataService ms = IMetadataService(address(metadata));
        wrapper = new NameWrapper(registry, baseRegistrar, ms);

        registry.setSubnodeOwner(
            ROOT_NODE,
            keccak256(bytes("eth")),
            address(baseRegistrar)
        );

        registry.setSubnodeOwner(ROOT_NODE, keccak256(bytes("xyz")), alice);

        assertEq(registry.owner(namehash), address(baseRegistrar));

        // DummyOracle dummyOracle = new DummyOracle(100000000);
        // AggregatorInterface aggregator = AggregatorInterface(
        //     address(dummyOracle)
        // );

        // StablePriceOracle priceOracle = new StablePriceOracle(
        //     aggregator,
        //     [0,0,4,2,1]
        // );
        // ReverseRegistrar reverseRegistrar = new ReverseRegistrar(registry);
        // ETHRegistrarController ensReg = new ETHRegistrarController(
        //     baseRegistrar,
        //     priceOracle,
        //     600,
        //     86400,
        //     reverseRegistrar,
        //     wrapper
        // );

        // controller = IETHRegistrarController(ensReg);
    }

    function testOwnership() public {
        (, bytes32 namehash) = NameEncoder.dnsEncodeName("eth");
        assertEq(wrapper.ownerOf(uint256(namehash)), EMPTY_ADDRESS);
    }

    function testWrap() public {
        address alice = vm.addr(1);
        vm.startPrank(alice);

        (bytes memory encodedName, bytes32 namehash) = NameEncoder
            .dnsEncodeName("xyz");
        assertEq(wrapper.ownerOf(uint256(namehash)), EMPTY_ADDRESS);
        registry.setApprovalForAll(address(wrapper), true);
        wrapper.wrap(encodedName, alice, EMPTY_ADDRESS);
        assertEq(wrapper.ownerOf(uint256(namehash)), alice);
    }

    function testAllowResolver() public {
        address alice = vm.addr(1);
        address bob = vm.addr(2);
        vm.startPrank(alice);

        (bytes memory encodedName, bytes32 namehash) = NameEncoder
            .dnsEncodeName("xyz");
        registry.setApprovalForAll(address(wrapper), true);
        wrapper.wrap(encodedName, alice, bob);
        assertEq(wrapper.ownerOf(uint256(namehash)), alice);
    }
}
