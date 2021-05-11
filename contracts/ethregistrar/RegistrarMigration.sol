pragma solidity ^0.5.0;

import "@ensdomains/ens/contracts/ENS.sol";
import "@ensdomains/ens/contracts/Registrar.sol";
import "@ensdomains/subdomain-registrar/contracts/AbstractSubdomainRegistrar.sol";
import "./BaseRegistrarImplementation.sol";
import "./OldBaseRegistrarImplementation.sol";

pragma solidity >=0.4.24;

interface OldENS {
    function setSubnodeOwner(bytes32 node, bytes32 label, address owner) external;
    function setResolver(bytes32 node, address resolver) external;
    function setOwner(bytes32 node, address owner) external;
    function setTTL(bytes32 node, uint64 ttl) external;
    function owner(bytes32 node) external view returns (address);
    function resolver(bytes32 node) external view returns (address);
    function ttl(bytes32 node) external view returns (uint64);
}

contract RegistrarMigration {
    using SafeMath for uint;

    bytes constant private UNUSED_SUBDOMAIN = hex'ffffffffffffffff';

    Registrar public legacyRegistrar;
    uint transferPeriodEnds;
    OldBaseRegistrarImplementation public oldRegistrar;
    BaseRegistrarImplementation public newRegistrar;
    OldENS public oldENS;
    ENS public newENS;
    AbstractSubdomainRegistrar public oldSubdomainRegistrar;
    AbstractSubdomainRegistrar public newSubdomainRegistrar;

    bytes32 public baseNode;

    constructor(OldBaseRegistrarImplementation _old, BaseRegistrarImplementation _new, AbstractSubdomainRegistrar _oldSubdomainRegistrar, AbstractSubdomainRegistrar _newSubdomainRegistrar) public {
        oldRegistrar = _old;
        oldENS = OldENS(address(_old.ens()));
        baseNode = _old.baseNode();
        legacyRegistrar = _old.previousRegistrar();
        transferPeriodEnds = _old.transferPeriodEnds();
        oldSubdomainRegistrar = _oldSubdomainRegistrar;

        newRegistrar = _new;
        newENS = _new.ens();
        require(_new.baseNode() == baseNode);
        newSubdomainRegistrar = _newSubdomainRegistrar;
    }

    function doMigration(uint256 tokenId, address registrant, uint expires) internal {
        bytes32 node = keccak256(abi.encodePacked(baseNode, bytes32(tokenId)));
        address controller = oldENS.owner(node);

        if(address(registrant) != address(oldSubdomainRegistrar) && hasCode(controller)) {
            // For names controlled by a contract or not in ENS, only migrate over the registration
            newRegistrar.registerOnly(tokenId, registrant, expires.sub(now));
            return;
        }

        // Register the name on the new registry with the same expiry time.
        newRegistrar.register(tokenId, address(this), expires.sub(now));

        // Copy over resolver, TTL and owner to the new registry.
        address resolver = oldENS.resolver(node);
        if(resolver != address(0)) {
            newENS.setResolver(node, resolver);
        }

        uint64 ttl = oldENS.ttl(node);
        if(ttl != 0) {
            newENS.setTTL(node, ttl);
        }

        if(address(registrant) == address(oldSubdomainRegistrar) && address(registrant) != address(0)) {
            // Handle subdomain registrar domains
            // Fetch data from the old subdomain registrar
            (string memory label, uint price,, uint referralFeePPM) = oldSubdomainRegistrar.query(bytes32(tokenId), string(UNUSED_SUBDOMAIN));
            address owner = oldSubdomainRegistrar.owner(bytes32(tokenId));
            if(bytes(label).length == 0) {
              revert("Unable to migrate domain on subdomain registrar");
            }

            // Transfer to the new subdomain registrar
            newRegistrar.approve(address(newSubdomainRegistrar), tokenId);
            newSubdomainRegistrar.configureDomainFor(label, price, referralFeePPM, address(uint160(owner)), address(0));
        } else {
            newENS.setOwner(node, controller);

            // Transfer the registration to the registrant.
            newRegistrar.transferFrom(address(this), registrant, tokenId);
        }

        // Replace ownership on the old registry so it can't be updated any further.
        oldENS.setSubnodeOwner(baseNode, bytes32(tokenId), address(this));
    }

    /**
     * @dev Migrate a name from the previous version of the BaseRegistrar
     */
    function migrate(uint256 tokenId) public {
        address registrant = oldRegistrar.ownerOf(tokenId);
        doMigration(tokenId, registrant, oldRegistrar.nameExpires(tokenId));
    }

    /**
     * @dev Migrate a list of names from the previous version of the BaseRegistrar.
     */
    function migrateAll(uint256[] calldata tokenIds) external {
        for(uint i = 0; i < tokenIds.length; i++) {
            migrate(tokenIds[i]);
        }
    }

    /**
     * @dev Migrate a name from the legacy (auction-based) registrar.
     */
    function migrateLegacy(bytes32 label) public {
        (Registrar.Mode mode, address deed, , ,) = legacyRegistrar.entries(label);
        require(mode == Registrar.Mode.Owned);
        address owner = Deed(deed).owner();
        doMigration(uint256(label), owner, transferPeriodEnds);
    }

    /**
     * @dev Migrate a list of names from the legacy (auction-based) registrar.
     */
    function migrateAllLegacy(bytes32[] calldata labels) external {
        for(uint i = 0; i < labels.length; i++) {
            migrateLegacy(labels[i]);
        }
    }

    function hasCode(address addr) private view returns(bool ret) {
        assembly {
            ret := not(not(extcodesize(addr)))
        }
    }
}
