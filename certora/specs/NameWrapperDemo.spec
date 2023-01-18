import "./erc20.spec"
using ENSRegistry as ens
using BaseRegistrarImplementation as registrar

/**************************************************
*                  Methods                       *
**************************************************/
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
    
    // NameWrapper internal
    _getEthLabelhash(bytes32 node, uint32 fuses) returns(bytes32) => ghostLabelHash(node, fuses)

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
    registrar.ownerOf(uint256) returns (address) envfree
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

definition maxUint32() returns uint32 = 0xffffffff;

/**************************************************
*                 Ghosts & Hooks                 *
**************************************************/
ghost mapping(bytes32 => mapping(uint32 => bytes32)) labelHashMap;

function ghostLabelHash(bytes32 node, uint32 fuses) returns bytes32 {
    return labelHashMap[node][fuses];
}

/**************************************************
*              Name States Definitions            *
**************************************************/
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
function ethLabelSetup(bytes32 node) {
    uint32 fuses = getFusesSuper(tokenIDFromNode(node));
    bytes32 labelhash;
    havoc labelhash;
    if(fuses & IS_DOT_ETH() == IS_DOT_ETH()) {
        require node == makeNode(ETH_NODE(), labelhash);
        labelHashMap[node][fuses] = labelhash;
    }
    else {
        labelHashMap[node][fuses] = 0;
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

    // Assuming first time wrap
    require _tokens(tokenID) == 0;

    wrap(e, name, wrappedOwner, resolver);
   
    uint32 fuses; address owner; uint64 expiry;
    owner, fuses, expiry = getDataSuper(tokenID);

    assert (fuses & IS_DOT_ETH() != IS_DOT_ETH());
}

// https://vaas-stg.certora.com/output/41958/a0f46548cc37c3f9cabd/?anonymousKey=fbe254745a3a6ac6516bd0f607c87da51440a57f
// Violated
rule cannotWrapTwice(bytes name) {
    // Block environment variables
    env e1;
    env e2;
    // Different msg.senders
    require e1.msg.sender != e2.msg.sender;
    require e2.msg.sender != currentContract;

    // Chronological order
    require e2.block.timestamp >= e1.block.timestamp;

    address wrappedOwner;
    address wrappedOtherOwner; 
    require wrappedOwner != wrappedOtherOwner;
    
    require name.length == 32;
    address resolver;
    bytes32 node; bytes32 parentNode;
        node, parentNode = makeNodeFromName(name);

    // Call wrap by e1.msg.sender at e1.block.timestamp
    wrap(e1, name, wrappedOwner, resolver);
    
    // Call wrap again by e2.msg.sender at later e2.block.timestamp
    wrap@withrevert(e2, name, wrappedOtherOwner, resolver);

    assert lastReverted;
}

// https://vaas-stg.certora.com/output/41958/7c445bd23cb0c1f0237d/?anonymousKey=b270caa735f211e28bf7ebb72d973a3c82fc495e
// Verified
rule cannotWrapTwiceNoApproval(bytes name) {
    // Block environment variables
    env e1;
    env e2;
    // Different msg.senders
    require e1.msg.sender != e2.msg.sender;
    require e2.msg.sender != currentContract;

    // Chronological order
    require e2.block.timestamp >= e1.block.timestamp;

    address wrappedOwner;
    address wrappedOtherOwner; 
    require wrappedOwner != wrappedOtherOwner;

    require name.length == 32;
    address resolver;
    bytes32 node; bytes32 parentNode;
        node, parentNode = makeNodeFromName(name);

    // Call wrap by e1.msg.sender at e1.block.timestamp
    wrap(e1, name, wrappedOwner, resolver);
    // Deny approval
    require !ens.isApprovedForAll(currentContract, e2.msg.sender);

    // Call wrap again by e2.msg.sender at later e2.block.timestamp
    wrap@withrevert(e2, name, wrappedOtherOwner, resolver);

    assert lastReverted;
}

/**************************************************
*              REVERT Rules                       *
**************************************************/

// Verified
rule cannotRenewExpiredName(bytes32 labelHash) {
    env e1;
    env e2;
    require e2.block.timestamp >= e1.block.timestamp;
    require e2.block.timestamp < 2^64;

    uint256 duration;
    bytes32 node = makeNode(ETH_NODE(), labelHash);
    uint256 tokenID = tokenIDFromNode(labelHash);

    ethLabelSetup(node);
    require registrar.nameExpires(tokenID) < 2^64;
    require labelHash != 0;
    
    bool expired_ = expired(e1, node);
    renew@withrevert(e2, tokenID, duration);
    
    assert expired_ => lastReverted;
}

/**************************************************
*              FUSES Rules                        *
**************************************************/

// Verified
rule fusesNotBurntAfterExpiration(bytes32 node, uint32 fuseMask)
{
    env e;
    require expired(e, node) && fuseMask != 0;
    assert !allFusesBurned(e, node, fuseMask);
}

// Result:
// https://vaas-stg.certora.com/output/41958/d0e2a402f6a5028a8b8e/?anonymousKey=fcf2840a357096d7416cea8dd9b7a787e21bf599
rule whoBurnsETHFuse(method f) filtered{f -> !f.isView} {
    env e;
    calldataarg args;
    bytes32 node = 0x40000; // arbitrary number, but isn't significant.
    require !allFusesBurned(e, node, IS_DOT_ETH());
        f(e, args);
    assert !allFusesBurned(e, node, IS_DOT_ETH());
}
