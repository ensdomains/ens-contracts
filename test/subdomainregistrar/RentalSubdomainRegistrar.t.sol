// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.17;

import "forge-std/Test.sol";
import {RentalSubdomainRegistrar, Name} from "contracts/subdomainregistrar/RentalSubdomainRegistrar.sol";
import {ENSRegistry} from "contracts/registry/ENSRegistry.sol";
import {BaseRegistrarImplementation} from "contracts/ethregistrar/BaseRegistrarImplementation.sol";
import {NameWrapper, CANNOT_UNWRAP} from "contracts/wrapper/NameWrapper.sol";
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
    }

    function testRegister() public {
        string memory label = "test";
        string memory name = string(bytes.concat(bytes(label), ".eth"));
        (, bytes32 node) = name.dnsEncodeName();
        string memory subLabel = "subdomain";
        string memory subName = string(
            bytes.concat(bytes(subLabel), ".", bytes(label), ".eth")
        );
        (, bytes32 subNode) = subName.dnsEncodeName();

        vm.startPrank(address(1));
        registrar.register(
            uint256(keccak256(bytes(label))),
            address(1),
            1 days
        );
        registrar.setApprovalForAll(address(wrapper), true);
        wrapper.wrapETH2LD(
            label,
            address(1),
            CANNOT_UNWRAP,
            MAX_EXPIRY,
            address(0)
        );

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
}
