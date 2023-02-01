// Import of other specs
import "./erc20.spec"

// Alias for contracts in the verification scope:
// using [name of contract] as [alias]
// note: currentContract is an alias for the main verified contract (NameWrapper)
using ENSRegistry as ens
using BaseRegistrarImplementation as registrar

/**************************************************
 *      Top Level Properties / Rule Ideas         *
 **************************************************/
 // Write here your ideas for rules for tracking progress:
 // 1. Valid states
 // 2. State transitions 
 // 3. Invariants
 // 4. Unit testing

/**************************************************
*                  Methods                       *
**************************************************/
// Declaration of methods to be used in the spec.
// envfree is an attribute for a method which doesn't require 
// an 'env' variable to be invoked in the spec.
methods {
    // NameWrapper
    ownerOf(uint256) returns (address)
    allFusesBurned(bytes32, uint32) returns (bool)
    _tokens(uint256) returns (uint256) envfree
    isApprovedForAll(address, address) returns (bool) envfree
    controllers(address) returns (bool) envfree

    // IERC1155
    onERC1155Received(address, address, uint256, uint256, bytes) returns (bytes4) => DISPATCHER(true)
    onERC1155BatchReceived(address, address, uint256[], uint256[], bytes) returns (bytes4) => DISPATCHER(true)
    
    // NameWrapper harness
    getLabelHashAndOffset(bytes32) returns (bytes32,uint256) envfree
    getParentNodeByNode(bytes32) returns (bytes32) envfree
    makeNode(bytes32, bytes32) returns (bytes32) envfree
    makeNodeFromName(bytes) returns (bytes32, bytes32) envfree
    tokenIDFromNode(bytes32) returns (uint256) envfree
    getExpiry(bytes32) returns (uint64)
    getDataSuper(uint256) returns (address, uint32, uint64) envfree
    getFusesSuper(uint256) returns (uint32) envfree
    getLabelHash(string) returns (bytes32) envfree
    getEthLabelhash(bytes32) returns (bytes32) envfree

    // ENSRegistry
    ens.owner(bytes32) returns (address) envfree
    ens.isApprovedForAll(address, address) returns (bool) envfree

    // Registrar
    registrar.nameExpires(uint256) returns (uint256) envfree
    registrar.isApprovedForAll(address, address) returns (bool) envfree
    registrar.ownerOf(uint256) returns (address)
}

/**************************************************
*                 Hashes Definitions              *
**************************************************/
definition ETH_NODE() returns bytes32 = 0x93cdeb708b7545dc668eb9280176169d1c33cfd8ed6f04690a0bcc88a93fc4ae;

/**************************************************
*                 Fuses Definitions               *
**************************************************/
definition CANNOT_UNWRAP() returns uint32 = 1;
definition CANNOT_BURN_FUSES() returns uint32 = 2;
definition CANNOT_TRANSFER() returns uint32 = 4;
definition CANNOT_SET_RESOLVER() returns uint32 = 8;
definition CANNOT_SET_TTL() returns uint32 = 16;
definition CANNOT_CREATE_SUBDOMAIN() returns uint32 = 32;
definition PARENT_CANNOT_CONTROL() returns uint32 = 2^16;
definition IS_DOT_ETH() returns uint32 = 2^17;

/**************************************************
*                 MISC Definitions              *
**************************************************/
definition GRACE_PERIOD() returns uint64 = 7776000; // 90 * 24 * 60 * 60 sec

/**************************************************
*                 Ghosts & Hooks                 *
**************************************************/

/**************************************************
*              Name States Definitions            *
**************************************************/
// Definitions for states of a node, according to the NameWrapper docs.
// Note that each definition requires a first 'env' argument, as the
// definition depends on the block.timestamp.

function unRegistered(env e, bytes32 node) returns bool {
    address ownerOf = ownerOf(e, tokenIDFromNode(node));
    address ensOwner = ens.owner(node);
    return ownerOf == 0 && (ensOwner == 0 || ensOwner == currentContract);
}

function unWrapped(env e, bytes32 node) returns bool {
    address ownerOf = ownerOf(e, tokenIDFromNode(node));
    address ensOwner = ens.owner(node);
    return ownerOf == 0 && (ensOwner != 0 && ensOwner != currentContract);
}

function wrapped(env e, bytes32 node) returns bool {
    return ownerOf(e, tokenIDFromNode(node)) !=0;
}

function emancipated(env e, bytes32 node) returns bool {
    return allFusesBurned(e, node, PARENT_CANNOT_CONTROL()) &&
            !allFusesBurned(e, node, CANNOT_UNWRAP());
}

function locked(env e, bytes32 node) returns bool {
    return allFusesBurned(e, node, CANNOT_UNWRAP());
}

function expired(env e, bytes32 node) returns bool {
    uint64 expiry = getExpiry(e, node);
    return e.block.timestamp > to_uint256(expiry);
}

/**************************************************
*             Setup & Helper functions            *
**************************************************/
// A CVL implementation of _getEthLabelhash:
// Can be used to get the labelHash of a node whose parent domain is ETH.
function getEthLabelhash_CVL(bytes32 node) returns bytes32 {
    uint32 fuses = getFusesSuper(tokenIDFromNode(node));
    bytes32 labelhash;
    if(fuses & IS_DOT_ETH() == IS_DOT_ETH()) {
        require node == makeNode(ETH_NODE(), labelhash);
        return labelhash;
    }
    else {
        return 0;
    }
}

/**************************************************
*              Wrapping Rules                     *
**************************************************/

// Verified
rule fusesAfterWrap(bytes name) {
    env e;
    require name.length == 32;

    bytes32 node; bytes32 parentNode;
        node, parentNode = makeNodeFromName(name);
    uint256 tokenID = tokenIDFromNode(node);
    address wrappedOwner;
    address resolver;

    // Assuming IS_DOT_ETH isn't burned before.
    uint32 fuses1 = getFusesSuper(tokenID);
    require (fuses1 & IS_DOT_ETH() != IS_DOT_ETH());

    wrap(e, name, wrappedOwner, resolver);
   
    uint32 fuses2 = getFusesSuper(tokenID);

    assert (fuses2 & IS_DOT_ETH() != IS_DOT_ETH());
}

// Violated
rule cannotWrapTwice(bytes name) {
    // Block environment variables
    env e1;
    env e2;

    // Different msg.senders
    require e1.msg.sender != e2.msg.sender;
    // Assuming that the contract is not the msg.sender [SAFE]
    require e2.msg.sender != currentContract;

    // Chronological order
    require e2.block.timestamp >= e1.block.timestamp;

    address wrappedOwner1;
    address wrappedOwner2; 
    
    require name.length == 32;
    address resolver;
    bytes32 node; bytes32 parentNode;
        node, parentNode = makeNodeFromName(name);

    // Assuming no approval for the e2.msg.sender:
    // Verified if this require is applied.
    // require !ens.isApprovedForAll(currentContract, e2.msg.sender);

    // Call wrap by e1.msg.sender at e1.block.timestamp
    wrap(e1, name, wrappedOwner1, resolver);
    
    // Call wrap again by e2.msg.sender at later e2.block.timestamp
    wrap@withrevert(e2, name, wrappedOwner2, resolver);

    assert lastReverted;
}

/**************************************************
*              REVERT Rules                       *
**************************************************/

// Violated
rule cannotRenewExpiredName(string label) {
    env e1;
    env e2;
    // Chronological order
    require e2.block.timestamp >= e1.block.timestamp;
    // Reasonable time stamp [SAFE]
    require e2.block.timestamp < 2^64;

    require label.length == 32;
    bytes32 labelHash = getLabelHash(label);
    require labelHash != 0;

    uint256 duration;
    bytes32 node = makeNode(ETH_NODE(), labelHash);
    uint256 tokenID = tokenIDFromNode(labelHash);
    require getEthLabelhash(node) == labelHash;

    // Verified when this is applied.
    // The uint64 casting of nameExpires can lead to earlier expiry than expected.
    // In general nameExpires is uint256 and can be set by anyone.
    // require registrar.nameExpires(tokenID) < 2^64;
    
    bool expired_ = expired(e1, node);
    renew@withrevert(e2, tokenID, duration);
    
    assert expired_ => lastReverted;
}

/**************************************************
*              FUSES Rules                        *
**************************************************/

// Verified
rule fusesNotBurntAfterExpiration(bytes32 node, uint32 fuseMask) {
    env e;
    require expired(e, node) && fuseMask != 0;
    assert !allFusesBurned(e, node, fuseMask);
}

// Verified
rule emancipatedIsNotLocked(env e, bytes32 node) {
    bool _emancipated = emancipated(e, node);
    bool _locked = locked(e, node);
    assert _emancipated => !_locked;
}
