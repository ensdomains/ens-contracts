pragma solidity >=0.6.0 <0.8.0;
pragma experimental ABIEncoderV2;

import "hardhat/console.sol";
import "../interfaces/ENS.sol";
import "../interfaces/Resolver.sol";
import "../interfaces/ISubdomainRegistrar.sol";
import "../interfaces/INFTFuseWrapper.sol";

// import "@openzeppelin/contracts/token/ERC721/ERC721.sol";

struct Domain {
    uint256 price;
    uint256 referralFeePPM;
}

// SPDX-License-Identifier: MIT
contract SubdomainRegistrar is ISubdomainRegistrar {
    // namehash('eth')
    bytes32 public constant ETH_NODE =
        0x93cdeb708b7545dc668eb9280176169d1c33cfd8ed6f04690a0bcc88a93fc4ae;

    bool public stopped = false;
    address public registrarOwner;
    address public migration;
    address public registrar;
    mapping(bytes32 => Domain) domains;

    ENS public ens;
    INFTFuseWrapper public wrapper;

    modifier ownerOnly(bytes32 node) {
        address owner = wrapper.ownerOf(uint256(node));
        require(
            owner == msg.sender || wrapper.isApprovedForAll(owner, msg.sender),
            "Not owner"
        ); //TODO fix only owner
        _;
    }

    modifier notStopped() {
        require(!stopped);
        _;
    }

    modifier registrarOwnerOnly() {
        require(msg.sender == registrarOwner);
        _;
    }

    constructor(ENS _ens, INFTFuseWrapper _wrapper) {
        ens = _ens;
        wrapper = _wrapper;
        ens.setApprovalForAll(address(wrapper), true);
    }

    function configureDomain(
        bytes32 parentNode,
        string memory label,
        uint256 price,
        uint256 referralFeePPM
    ) public {
        bytes32 labelhash = keccak256(bytes(label));
        bytes32 node = keccak256(abi.encodePacked(parentNode, labelhash));
        Domain storage domain = domains[node];

        // if (parentNode == ETH_NODE) {
        //     // check if it's eth and then wrap with wrap2ld
        //     wrapper.wrapETH2LD(uint256(label), 255, msg.sender);
        // }

        //check if I'm the owner
        if (ens.owner(node) != address(wrapper)) {
            ens.setOwner(node, address(this));
            wrapper.wrap(parentNode, label, 255, msg.sender);
            console.log(
                "wrapper.ownerOf(uint256(node))",
                wrapper.ownerOf(uint256(node))
            );
        }
        //if i'm in the owner, do nothing
        //otherwise makes myself the owner

        // if (domain.owner != _owner) {
        //     domain.owner = _owner;
        // }

        domain.price = price;
        domain.referralFeePPM = referralFeePPM;

        emit DomainConfigured(node);
    }

    function doRegistration(
        bytes32 node,
        bytes32 label,
        address subdomainOwner,
        Resolver resolver,
        bytes[] calldata data
    ) internal {
        // Get the subdomain so we can configure it
        console.log("doRegistration", address(this));
        wrapper.setSubnodeRecordAndWrap(
            node,
            label,
            address(this),
            address(resolver),
            0,
            255
        );

        //set the owner to this contract so it can setAddr()

        bytes32 subnode = keccak256(abi.encodePacked(node, label));

        //setRecords
        resolver.safeMulticall(subnode, data);

        address addrVar = resolver.addr(subnode);
        console.log(addrVar);

        // Pass ownership of the new subdomain to the registrant
        ens.setOwner(subnode, subdomainOwner);

        // Problem - Current Public Resolver checks ENS registry for ownership. Owner will be the Restrivtve Wrapper
        // Possible solution A - use PublicResolver that knows how to check Restrictive Wrapper

        // check if the address is != 0 and then set addr
        // reason to check some resolvers don't have setAddr
    }

    function register(
        bytes32 node,
        string calldata subdomain,
        address _subdomainOwner,
        address payable referrer,
        address resolver,
        bytes[] calldata data
    ) external payable override notStopped {
        address subdomainOwner = _subdomainOwner;
        bytes32 subdomainLabel = keccak256(bytes(subdomain));

        // Subdomain must not be registered already.
        require(
            ens.owner(keccak256(abi.encodePacked(node, subdomainLabel))) ==
                address(0),
            "Subdomain already registered"
        );

        Domain storage domain = domains[node];

        // Domain must be available for registration
        //require(keccak256(abi.encodePacked(domain.name)) == label);

        // User must have paid enough
        require(msg.value >= domain.price, "Not enough ether provided");

        // // Send any extra back
        if (msg.value > domain.price) {
            msg.sender.transfer(msg.value - domain.price);
        }

        // // Send any referral fee
        uint256 total = domain.price;
        if (
            domain.referralFeePPM * domain.price > 0 &&
            referrer != address(0x0) &&
            referrer != wrapper.ownerOf(uint256(node))
        ) {
            uint256 referralFee =
                (domain.price * domain.referralFeePPM) / 1000000;
            referrer.transfer(referralFee);
            total -= referralFee;
        }

        // // Send the registration fee
        // if (total > 0) {
        //     domain.owner.transfer(total);
        // }

        // Register the domain
        if (subdomainOwner == address(0x0)) {
            subdomainOwner = msg.sender;
        }

        doRegistration(
            node,
            subdomainLabel,
            subdomainOwner,
            Resolver(resolver),
            data
        );

        emit NewRegistration(
            node,
            subdomain,
            subdomainOwner,
            referrer,
            domain.price
        );
    }

    /**
     * @dev Mint Erc721 for the subdomain
     * @param id The token ID (keccak256 of the label).
     * @param subdomainOwner The address that should own the registration.
     * @param tokenURI tokenURI address
     */
}

// interface IRestrictedNameWrapper {
//     function wrap(bytes32 node) external;
// }
