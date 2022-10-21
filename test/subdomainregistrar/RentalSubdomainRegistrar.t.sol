// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.17;

import "forge-std/Test.sol";
import {RentalSubdomainRegistrar, Name, InsufficientFunds} from "contracts/subdomainregistrar/RentalSubdomainRegistrar.sol";
import {ParentExpired} from "contracts/subdomainregistrar/BaseSubdomainRegistrar.sol";
import {ENSRegistry} from "contracts/registry/ENSRegistry.sol";
import {Resolver} from "contracts/resolvers/Resolver.sol";
import {BaseRegistrarImplementation} from "contracts/ethregistrar/BaseRegistrarImplementation.sol";
import {NameWrapper, CANNOT_UNWRAP, Unauthorised} from "contracts/wrapper/NameWrapper.sol";
import {StaticMetadataService} from "contracts/wrapper/StaticMetadataService.sol";
import {IMetadataService} from "contracts/wrapper/IMetadataService.sol";
import {INameWrapper, PublicResolver} from "contracts/resolvers/PublicResolver.sol";
import {MockERC20} from "../utils/mocks/MockErc20.sol";
import {NameEncoder} from "contracts/utils/NameEncoder.sol";

contract RentalSubdomainRegistrarTest is Test {
    using NameEncoder for string;

    ENSRegistry public ens;
    BaseRegistrarImplementation public registrar;
    StaticMetadataService public metadataService;
    NameWrapper public wrapper;
    PublicResolver public resolver;
    RentalSubdomainRegistrar public subdomainRegistrar;
    MockERC20 public erc20;

    address[] public addresses = new address[](2);
    uint64 MAX_EXPIRY = type(uint64).max;

    string label = "test";
    string name = string(bytes.concat(bytes(label), ".eth"));
    bytes32 node;
    string subLabel = "subdomain";
    string subName =
        string(bytes.concat(bytes(subLabel), ".", bytes(label), ".eth"));
    bytes32 subNode;

    string subLabel2 = "subdomain2";
    string subName2 =
        string(bytes.concat(bytes(subLabel2), ".", bytes(label), ".eth"));
    bytes32 subNode2;

    function setUp() public {
        vm.warp(1641070800);
        ens = new ENSRegistry();
        registrar = new BaseRegistrarImplementation(
            ens,
            0x93cdeb708b7545dc668eb9280176169d1c33cfd8ed6f04690a0bcc88a93fc4ae
        );
        registrar.addController(address(this));
        registrar.addController(address(1));
        metadataService = new StaticMetadataService("https://ens.domains");
        wrapper = new NameWrapper(
            ens,
            registrar,
            IMetadataService(address(metadataService))
        );
        resolver = new PublicResolver(
            ens,
            INameWrapper(address(wrapper)),
            address(0),
            address(0)
        );

        addresses[0] = address(1);
        addresses[1] = address(2);
        erc20 = new MockERC20("ENS Token", "ENS", addresses);

        string memory eth = "eth";
        string memory xyz = "xyz";
        (, bytes32 ethNode) = eth.dnsEncodeName();
        (, bytes32 xyzNode) = xyz.dnsEncodeName();

        ens.setSubnodeOwner(
            0x0000000000000000000000000000000000000000000000000000000000000000,
            0x4f5b812789fc606be1b3b16908db13fc7a9adf7ca72641f84d75b47069d3d7f0,
            address(registrar)
        );

        ens.setSubnodeOwner(
            0x0000000000000000000000000000000000000000000000000000000000000000,
            keccak256(bytes("xyz")),
            address(1)
        );

        assertEq(ens.owner(ethNode), address(registrar));
        subdomainRegistrar = new RentalSubdomainRegistrar(address(wrapper));

        (, node) = name.dnsEncodeName();
        (, subNode) = subName.dnsEncodeName();
        (, subNode2) = subName2.dnsEncodeName();
    }

    function setupDomain(string memory label, address owner) public {
        registrar.register(uint256(keccak256(bytes(label))), owner, 1 weeks);
        registrar.setApprovalForAll(address(wrapper), true);
        wrapper.wrapETH2LD(label, owner, CANNOT_UNWRAP, MAX_EXPIRY, address(0));
    }

    function testRegister() public {
        vm.startPrank(address(1));
        setupDomain(label, address(1));

        assertEq(wrapper.ownerOf(uint256(node)), address(1));
        subdomainRegistrar.setupDomain(node, address(erc20), 1, address(1));
        wrapper.setApprovalForAll(address(subdomainRegistrar), true);
        uint256 balanceBefore = erc20.balanceOf(address(1));
        uint64 duration = 86400;
        (uint256 registrationFee, , ) = subdomainRegistrar.names(node);
        uint256 fee = registrationFee * duration;
        vm.stopPrank();
        vm.startPrank(address(2));
        erc20.approve(address(subdomainRegistrar), fee);
        bytes[] memory emptyArray;
        subdomainRegistrar.register(
            node,
            subLabel,
            address(2),
            address(0),
            0,
            duration,
            emptyArray
        );
        uint256 balanceAfter = erc20.balanceOf(address(2));
        assertEq(balanceBefore - fee, balanceAfter);
        assertEq(wrapper.ownerOf(uint256(subNode)), address(2));
    }

    function testRegisterFailsOnUnapprovedRegistrar() public {
        vm.startPrank(address(1));
        setupDomain(label, address(1));

        assertEq(wrapper.ownerOf(uint256(node)), address(1));
        subdomainRegistrar.setupDomain(node, address(erc20), 1, address(1));
        uint256 balanceBefore = erc20.balanceOf(address(1));
        uint64 duration = 86400;
        (uint256 registrationFee, , ) = subdomainRegistrar.names(node);
        uint256 fee = registrationFee * duration;
        vm.stopPrank();
        vm.startPrank(address(2));
        erc20.approve(address(subdomainRegistrar), fee);
        bytes[] memory emptyArray;
        vm.expectRevert(
            abi.encodeWithSelector(
                Unauthorised.selector,
                node,
                address(subdomainRegistrar)
            )
        );
        subdomainRegistrar.register(
            node,
            subLabel,
            address(2),
            address(0),
            0,
            duration,
            emptyArray
        );
    }

    function testRegisterSubdomainWithoutFee() public {
        vm.startPrank(address(1));
        setupDomain(label, address(1));

        assertEq(wrapper.ownerOf(uint256(node)), address(1));
        subdomainRegistrar.setupDomain(node, address(0), 0, address(1));
        wrapper.setApprovalForAll(address(subdomainRegistrar), true);

        uint64 duration = 86400;
        vm.stopPrank();
        vm.startPrank(address(2));
        bytes[] memory emptyRecords;
        subdomainRegistrar.register(
            node,
            subLabel,
            address(2),
            address(0),
            0,
            duration,
            emptyRecords
        );
        assertEq(wrapper.ownerOf(uint256(subNode)), address(2));
    }

    function testRegisterShouldRevertWhenInsufficientBalance() public {
        vm.startPrank(address(1));
        setupDomain(label, address(1));
        assertEq(wrapper.ownerOf(uint256(node)), address(1));

        subdomainRegistrar.setupDomain(node, address(erc20), 1, address(1));
        wrapper.setApprovalForAll(address(subdomainRegistrar), true);
        uint256 balanceBefore = erc20.balanceOf(address(1));
        uint64 duration = 86400;
        (uint256 registrationFee, , ) = subdomainRegistrar.names(node);
        uint256 fee = registrationFee * duration;
        vm.stopPrank();
        vm.startPrank(address(3));
        erc20.approve(address(subdomainRegistrar), fee);
        bytes[] memory emptyArray;
        vm.expectRevert(InsufficientFunds.selector);
        subdomainRegistrar.register(
            node,
            subLabel,
            address(2),
            address(0),
            0,
            duration,
            emptyArray
        );
    }

    function testRenew() public {
        vm.startPrank(address(1));
        setupDomain(label, address(1));
        assertEq(wrapper.ownerOf(uint256(node)), address(1));

        subdomainRegistrar.setupDomain(node, address(erc20), 1, address(1));
        wrapper.setApprovalForAll(address(subdomainRegistrar), true);
        uint256 balanceBefore = erc20.balanceOf(address(1));
        uint64 duration = 1 days;
        (uint256 registrationFee, , ) = subdomainRegistrar.names(node);
        uint256 fee = registrationFee * duration;
        vm.stopPrank();
        vm.startPrank(address(2));
        erc20.approve(address(subdomainRegistrar), type(uint256).max);
        bytes[] memory emptyArray;
        subdomainRegistrar.register(
            node,
            subLabel,
            address(2),
            address(0),
            0,
            duration,
            emptyArray
        );
        (, , uint64 expiry) = wrapper.getData(uint256(subNode));
        uint256 balanceAfter = erc20.balanceOf(address(2));
        assertEq(balanceBefore - fee, balanceAfter);
        assertEq(wrapper.ownerOf(uint256(subNode)), address(2));
        uint256 balanceBeforeRenew = erc20.balanceOf(address(2));
        subdomainRegistrar.renew(node, keccak256(bytes(subLabel)), duration);
        uint256 balanceAfterRenew = erc20.balanceOf(address(2));
        (, , uint64 expiryAfter) = wrapper.getData(uint256(subNode));
        assertEq(balanceBeforeRenew - fee, balanceAfterRenew);
        assertEq(expiry, expiryAfter - duration);
    }

    function testRenewAllows0FeeNamesToBeRenewed() public {
        vm.startPrank(address(1));
        setupDomain(label, address(1));
        assertEq(wrapper.ownerOf(uint256(node)), address(1));

        subdomainRegistrar.setupDomain(node, address(0), 0, address(1));
        wrapper.setApprovalForAll(address(subdomainRegistrar), true);
        uint64 duration = 86400;
        vm.stopPrank();
        vm.startPrank(address(2));
        bytes[] memory emptyArray;
        subdomainRegistrar.register(
            node,
            subLabel,
            address(2),
            address(0),
            0,
            duration,
            emptyArray
        );
        (, , uint64 expiry) = wrapper.getData(uint256(subNode));
        assertEq(wrapper.ownerOf(uint256(subNode)), address(2));
        subdomainRegistrar.renew(node, keccak256(bytes(subLabel)), duration);
        (, , uint64 expiryAfter) = wrapper.getData(uint256(subNode));
        assertEq(expiry, expiryAfter - duration);
    }

    function testRenewShouldRevertIfParentIsExpired() public {
        vm.startPrank(address(1));
        setupDomain(label, address(1));
        assertEq(wrapper.ownerOf(uint256(node)), address(1));

        subdomainRegistrar.setupDomain(node, address(erc20), 1, address(1));
        wrapper.setApprovalForAll(address(subdomainRegistrar), true);
        uint256 balanceBefore = erc20.balanceOf(address(1));
        uint64 duration = 1 days;
        (uint256 registrationFee, , ) = subdomainRegistrar.names(node);
        uint256 fee = registrationFee * duration;
        vm.stopPrank();
        vm.startPrank(address(2));
        erc20.approve(address(subdomainRegistrar), type(uint256).max);
        bytes[] memory emptyArray;
        subdomainRegistrar.register(
            node,
            subLabel,
            address(2),
            address(0),
            0,
            duration,
            emptyArray
        );
        (, , uint64 expiry) = wrapper.getData(uint256(subNode));
        uint256 balanceAfter = erc20.balanceOf(address(2));
        assertEq(balanceBefore - fee, balanceAfter);
        assertEq(wrapper.ownerOf(uint256(subNode)), address(2));
        uint256 balanceBeforeRenew = erc20.balanceOf(address(2));
        vm.warp(block.timestamp + 1 weeks + 1 seconds);
        vm.expectRevert(abi.encodeWithSelector(ParentExpired.selector, node));
        subdomainRegistrar.renew(node, keccak256(bytes(subLabel)), duration);
    }

    function testRegisterWithRecords() public {
        vm.startPrank(address(1));
        setupDomain(label, address(1));
        assertEq(wrapper.ownerOf(uint256(node)), address(1));

        subdomainRegistrar.setupDomain(node, address(erc20), 1, address(1));
        wrapper.setApprovalForAll(address(subdomainRegistrar), true);
        uint256 balanceBefore = erc20.balanceOf(address(1));
        uint64 duration = 1 days;
        (uint256 registrationFee, , ) = subdomainRegistrar.names(node);
        uint256 fee = registrationFee * duration;
        vm.stopPrank();
        vm.startPrank(address(2));
        erc20.approve(address(subdomainRegistrar), type(uint256).max);
        bytes[] memory records = new bytes[](1);
        records[0] = abi.encodeWithSignature(
            "setAddr(bytes32,address)",
            subNode,
            address(0x1234)
        );
        subdomainRegistrar.register(
            node,
            subLabel,
            address(2),
            address(resolver),
            0,
            duration,
            records
        );
        (, , uint64 expiry) = wrapper.getData(uint256(subNode));
        uint256 balanceAfter = erc20.balanceOf(address(2));
        assertEq(balanceBefore - fee, balanceAfter);
        assertEq(wrapper.ownerOf(uint256(subNode)), address(2));
        assertEq(
            Resolver(ens.resolver(subNode)).addr(subNode),
            address(0x1234)
        );
    }

    function testBatchRegister() public {
        vm.startPrank(address(1));
        setupDomain(label, address(1));
        assertEq(wrapper.ownerOf(uint256(node)), address(1));

        subdomainRegistrar.setupDomain(node, address(erc20), 1, address(1));
        wrapper.setApprovalForAll(address(subdomainRegistrar), true);
        uint256 balanceBefore = erc20.balanceOf(address(1));
        uint64 duration = 1 days;
        (uint256 registrationFee, , ) = subdomainRegistrar.names(node);
        uint256 fee = registrationFee * duration;
        vm.stopPrank();
        vm.startPrank(address(2));
        erc20.approve(address(subdomainRegistrar), type(uint256).max);
        bytes[] memory records = new bytes[](1);
        records[0] = abi.encodeWithSignature(
            "setAddr(bytes32,address)",
            subNode,
            address(0x1234)
        );
        bytes[] memory records2 = new bytes[](1);
        records2[0] = abi.encodeWithSignature(
            "setAddr(bytes32,address)",
            subNode2,
            address(0x1235)
        );

        string[] memory subLabels = new string[](2);
        subLabels[0] = subLabel;
        subLabels[1] = subLabel2;
        address[] memory owners = new address[](2);
        owners[0] = address(2);
        owners[1] = address(3);
        bytes[][] memory recordsArray = new bytes[][](2);
        recordsArray[0] = records;
        recordsArray[1] = records2;
        subdomainRegistrar.batchRegister(
            node,
            subLabels,
            owners,
            address(resolver),
            0,
            duration,
            recordsArray
        );
        (, , uint64 expiry) = wrapper.getData(uint256(subNode));
        uint256 balanceAfter = erc20.balanceOf(address(2));
        assertEq(balanceBefore - fee * 2, balanceAfter);
        assertEq(wrapper.ownerOf(uint256(subNode)), address(2));
        assertEq(
            Resolver(ens.resolver(subNode)).addr(subNode),
            address(0x1234)
        );
        assertEq(wrapper.ownerOf(uint256(subNode2)), address(3));
        assertEq(
            Resolver(ens.resolver(subNode2)).addr(subNode2),
            address(0x1235)
        );
    }

    function testBatchRenew() public {
        vm.startPrank(address(1));
        setupDomain(label, address(1));
        assertEq(wrapper.ownerOf(uint256(node)), address(1));

        subdomainRegistrar.setupDomain(node, address(erc20), 1, address(1));
        wrapper.setApprovalForAll(address(subdomainRegistrar), true);
        uint256 balanceBefore = erc20.balanceOf(address(1));
        uint64 duration = 1 days;
        (uint256 registrationFee, , ) = subdomainRegistrar.names(node);
        uint256 fee = registrationFee * duration;
        vm.stopPrank();
        vm.startPrank(address(2));
        erc20.approve(address(subdomainRegistrar), type(uint256).max);
        bytes[] memory records = new bytes[](1);
        records[0] = abi.encodeWithSignature(
            "setAddr(bytes32,address)",
            subNode,
            address(0x1234)
        );
        bytes[] memory records2 = new bytes[](1);
        records2[0] = abi.encodeWithSignature(
            "setAddr(bytes32,address)",
            subNode2,
            address(0x1235)
        );

        string[] memory subLabels = new string[](2);
        subLabels[0] = subLabel;
        subLabels[1] = subLabel2;
        address[] memory owners = new address[](2);
        owners[0] = address(2);
        owners[1] = address(3);
        bytes[][] memory recordsArray = new bytes[][](2);
        recordsArray[0] = records;
        recordsArray[1] = records2;
        subdomainRegistrar.batchRegister(
            node,
            subLabels,
            owners,
            address(resolver),
            0,
            duration,
            recordsArray
        );
        (, , uint64 expiry) = wrapper.getData(uint256(subNode));
        (, , uint64 expiry2) = wrapper.getData(uint256(subNode2));
        uint256 balanceAfter = erc20.balanceOf(address(2));
        assertEq(balanceBefore - fee * 2, balanceAfter);
        assertEq(wrapper.ownerOf(uint256(subNode)), address(2));
        assertEq(
            Resolver(ens.resolver(subNode)).addr(subNode),
            address(0x1234)
        );
        assertEq(wrapper.ownerOf(uint256(subNode2)), address(3));
        assertEq(
            Resolver(ens.resolver(subNode2)).addr(subNode2),
            address(0x1235)
        );

        bytes32[] memory labelHashes = new bytes32[](2);
        labelHashes[0] = keccak256(bytes(subLabel));
        labelHashes[1] = keccak256(bytes(subLabel2));

        subdomainRegistrar.batchRenew(node, labelHashes, duration);
        (, , uint64 expiryAfter) = wrapper.getData(uint256(subNode));
        assertEq(expiryAfter, expiry + duration);
        (, , uint64 expiryAfter2) = wrapper.getData(uint256(subNode));
        assertEq(expiryAfter2, expiry2 + duration);
    }
}
