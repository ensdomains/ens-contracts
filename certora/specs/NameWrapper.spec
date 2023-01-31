import "./erc20.spec"
using ENSRegistry as ens
using BaseRegistrarImplementation as registrar
using NameWrapperHarness as nameWrapperContract

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
    //_getEthLabelhash(bytes32 node, uint32 fuses) returns(bytes32) => ghostLabelHash(node, fuses)

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

    // upgraded contract
    //setSubnodeRecord(bytes32, string, address, address, uint64, uint32, uint64) => DISPATCHER(true)
    //wrapETH2LD(string, address, uint32, uint64, address) => DISPATCHER(true)

    // ens
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

definition GRACE_PERIOD() returns uint64 = 7776000; // 90 * 24 * 60 * 60 sec
/**************************************************
*                 Ghosts & Hooks                 *
**************************************************/

ghost mapping(bytes32 => mapping(uint32 => bytes32)) labelHashMap;

function ghostLabelHash(bytes32 node, uint32 fuses) returns bytes32 {
    uint32 fuses_prime = 0xffffffff & fuses;
    return labelHashMap[node][fuses_prime];
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
*             (Currently unused)
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

// Integrity of the readLabel function.
function requireReadLabelIntegrity_node(bytes32 _node, bytes32 _parentNode, bytes32 _labelhash) {
    bytes32 labelhash_;
    uint256 offset_;
    labelhash_, offset_ = getLabelHashAndOffset(_node);

    require _node == makeNode(_parentNode, _labelhash);
    require _labelhash == labelhash_;
    require _parentNode == getParentNodeByNode(_node);
}

// Integrity of the readLabel function.
function requireReadLabelIntegrity_name(bytes _name, bytes32 _parentNode, bytes32 _node) {
    bytes32 node_; bytes32 parentNode_;
    node_, parentNode_ = makeNodeFromName(_name);

    require _node == node_;
    require _parentNode == parentNode_;
}
/**************************************************
*              Invariants                        *
**************************************************/

// "Expiry can only be less than or equal to the parent's expiry"
invariant expiryOfParentName(env e, bytes32 node, bytes32 parentNode, bytes32 labelhash)
    node == makeNode(parentNode, labelhash) => getExpiry(e, node) <= getExpiry(e, parentNode)
    {
        preserved with (env ep) {
            require ep.msg.sender == e.msg.sender;
            require registrar.nameExpires(tokenIDFromNode(node)) < 2^64;
            require registrar.nameExpires(tokenIDFromNode(parentNode)) < 2^64;
        }
    }
/**************************************************
*              Wrapping Rules                     *
**************************************************/

rule cannotWrapEthTwice(string label) {
    // Block environment variables
    env e1;
    env e2;
    // Different msg.senders
    require e1.msg.sender != e2.msg.sender;
    // Chronological order
    require e2.block.timestamp >= e1.block.timestamp;

    uint16 ownerControlledFuses;
    address resolver;
    address wrappedOwner;
    address wrappedOtherOwner; 
    require wrappedOwner != wrappedOtherOwner;

    require label.length == 32;
    bytes32 labelHash = getLabelHash(label);
    bytes32 node = makeNode(ETH_NODE(), labelHash);
    
    // Call wrapETH by e1.msg.sender at e1.block.timestamp
    wrapETH2LD(e1, label, wrappedOwner, ownerControlledFuses, resolver);
    
    // Call wrapETH again by e2.msg.sender at later e2.block.timestamp
    wrapETH2LD@withrevert(e2, label, wrappedOtherOwner, ownerControlledFuses, resolver);
    
    assert lastReverted;
}

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

    // Deny approval
    //require !ens.isApprovedForAll(currentContract, e2.msg.sender);
    
    // Call wrap again by e2.msg.sender at later e2.block.timestamp
    wrap@withrevert(e2, name, wrappedOtherOwner, resolver);

    assert lastReverted;
}

rule wrapUnwrap(bytes name) {
    env e;
    address controller; address resolver;
    bytes32 labelhash;
    address wrappedOwner = e.msg.sender;
    bytes32 node; bytes32 parentNode;
        node, parentNode = makeNodeFromName(name);
    require node == makeNode(parentNode, labelhash);

    storage initStorage = lastStorage;

    unwrap(e, parentNode, labelhash, controller);
    bool canModify1 = canModifyName(e, node, e.msg.sender);

    wrap(e, name, wrappedOwner, resolver) at initStorage;
    bool canModify2 = canModifyName(e, node, e.msg.sender);

    unwrap@withrevert(e, parentNode, labelhash, controller);
    
    assert !lastReverted;
}

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

// Verified
rule fusesAfterWrapETHL2D(string label) {
    env e;
    bytes32 labelHash = getLabelHash(label);
    require label.length == 32;

    bytes32 node = makeNode(ETH_NODE(), labelHash);
    uint256 tokenID = tokenIDFromNode(node);
    address wrappedOwner;
    uint16 ownerControlledFuses;
    address resolver;

    // Assuming first time wrap
    require _tokens(tokenID) == 0;

    wrapETH2LD(e, label, wrappedOwner, ownerControlledFuses, resolver);
   
    uint32 fuses = getFusesSuper(tokenID);

    // verified
    assert (fuses & IS_DOT_ETH() == IS_DOT_ETH());
}

/**************************************************
*              TRANSITION Rules                   *
**************************************************/

rule whoTurnedWrappedToUnWrapped(method f, bytes32 node) 
filtered {f -> !f.isView} {
    env e;
    calldataarg args;

    uint32 fuseMask;
    
    require wrapped(e, node);
        f(e, args);
    assert !unWrapped(e, node);
}

rule whoTurnedUnwrappedToWrapped(method f, bytes32 node) 
filtered {f -> !f.isView} {
    env e;
    calldataarg args;
    
    uint32 fuseMask;
    
    require unWrapped(e, node);
        f(e, args);
    assert !wrapped(e, node);
}

rule setSubnodeRecordStateTransition(bytes32 parentNode, string label) {
    env e;
    require label.length == 32;
    bytes32 labelhash = getLabelHash(label);
    bytes32 node = makeNode(parentNode, labelhash);
    address owner;
    address resolver;
    uint64 ttl;
    uint32 fuses;
    uint64 expiry;
    
    bool _unRegistered = unRegistered(e, node);
    bool _unWrapped = unWrapped(e, node);
    bool _wrapped = wrapped(e, node);
        bool preState = _unRegistered || _unWrapped || _wrapped;

    setSubnodeRecord(e, parentNode, label, owner,
        resolver, ttl, fuses, expiry);

    bool wrapped_ = wrapped(e, node);
    bool emancipated_ = emancipated(e, node);
    bool locked_ = locked(e, node);
        bool postState = wrapped_ || emancipated_ || locked_;

    assert preState && postState;
}

// Verified
rule emancipatedIsNotLocked(env e, bytes32 node) {
    bool _emancipated = emancipated(e, node);
    bool _locked = locked(e, node);
    assert _emancipated => !_locked;
}

// "Only Emancipated names can be Locked ""
rule onlyEmancipatedCanBeLocked(method f, bytes32 node) {
    env e;
    calldataarg args;

    bool emancipatedBefore = emancipated(e, node);
    bool lockedBefore = locked(e, node);
        
        f(e, args);

    bool lockedAfter = locked(e, node);
    bool emancipatedAfter = emancipated(e, node);

    // If 
    //  the state was not 'locked' before and turned to 'locked'
    // then:
    //  the state was 'emancipated' before and turned to not 'emancipated'
    assert lockedAfter && !lockedBefore => emancipatedBefore && !emancipatedAfter;
}

/**************************************************
*              REVERT Rules                       *
**************************************************/

// Violated
// https://vaas-stg.certora.com/output/41958/f28f8d2f1abb26625b9b/?anonymousKey=9fd4551cad296a15b936083c3fdedc376c3d48cb

// Verified (with nameExpires require)
// https://vaas-stg.certora.com/output/41958/b4d4147a3d8fa2216190/?anonymousKey=36dfa1ba90c7fe2b9ac627f82c02cccc476935b5
rule cannotRenewExpiredName(string label) {
    env e1;
    env e2;
    require e2.block.timestamp >= e1.block.timestamp;
    require e2.block.timestamp < 2^64;

    require label.length == 32;
    bytes32 labelHash = getLabelHash(label);
    require labelHash != 0;

    uint256 duration;
    bytes32 node = makeNode(ETH_NODE(), labelHash);
    uint256 tokenID = tokenIDFromNode(labelHash);
    require getEthLabelhash(node) == labelHash;

    // Verified when this is applied.
    //require registrar.nameExpires(tokenID) < 2^64;
    
    bool expired_ = expired(e1, node);
    renew@withrevert(e2, tokenID, duration);
    
    assert expired_ => lastReverted;
}

// setSubnodeOwner() and setSubnodeRecord() both revert when the subdomain is Emancipated or Locked.
rule setSubnodeRecordRevertsIfEmancipatedOrLocked(bytes32 parentNode, string label) {
    env e;
    bytes32 labelhash = getLabelHash(label);
    bytes32 subnode = makeNode(parentNode, labelhash);
    address owner;
    address resolver;
    uint64 ttl;
    uint32 fuses;
    uint64 expiry;
    require emancipated(e, subnode) || locked(e, subnode);

    setSubnodeRecord@withrevert(e, parentNode, label, owner,
        resolver, ttl, fuses, expiry);

    assert lastReverted;
}

// "setSubnodeOwner() and setSubnodeRecord() both revert when the subdomain is Emancipated or Locked."
rule setSubnodeOwnerRevertsIfEmancipatedOrLocked(bytes32 parentNode, string label) {
    env e;
    require label.length == 32;
    bytes32 labelhash = getLabelHash(label);
    bytes32 subnode = makeNode(parentNode, labelhash);
    address owner;
    uint32 fuses;
    uint64 expiry;

    require emancipated(e, subnode) || locked(e, subnode);
    
    setSubnodeOwner@withrevert(e, parentNode, label, owner, fuses, expiry);

    assert lastReverted;
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

rule whoBurnsETHFuse(method f) filtered{f -> !f.isView} {
    env e;
    calldataarg args;
    bytes32 node = 0x40000; // arbitrary number, but isn't significant.
    require !allFusesBurned(e, node, IS_DOT_ETH());
        f(e, args);
    assert !allFusesBurned(e, node, IS_DOT_ETH());
}

// PCC - PARENT_CANNOT_CONTROL
// CUW - CANNOT_UNWRAP
rule cannotBurn_CANNOT_UNWRAP_Unless_PARENT_CANNOT_CONTROL_IsBurned(bytes32 node, method f) 
filtered{f -> !f.isView} {
    env e; 
    calldataarg args;

    bool PCC_Before = allFusesBurned(e, node, PARENT_CANNOT_CONTROL());
    bool CUW_Before = allFusesBurned(e, node, CANNOT_UNWRAP());
    require CUW_Before == false;  // the CANNOT_UNWRAP fuse is off

        f(e,args);  // call any function

    bool PCC_After = allFusesBurned(e, node, PARENT_CANNOT_CONTROL());
    bool CUW_After = allFusesBurned(e, node, CANNOT_UNWRAP());

    // if the CANNOT_UNWRAP fuse is burned, then PARENT_CANNOT_CONTROL must have been burned before.
    assert (CUW_After == true) => (PCC_Before == true);
}
/**************************************************
*              MISC Rules                         *
**************************************************/

rule sanity(method f) {
    calldataarg args;
    env e;
    f(e,args);
    assert false; 
}

rule makeNodeIsInjective(bytes32 parentNode, bytes32 labelHash1, bytes32 labelHash2) {
    require labelHash1 != labelHash2;

    assert makeNode(parentNode, labelHash1) != makeNode(parentNode, labelHash2);
}

rule whichFuseBlocksFunction(method f, bytes32 node, uint16 fuses) {
    env e1; env e2;
    calldataarg args;
    storage initStorage = lastStorage;

    f(e1, args);

    setFuses(e2, node, fuses) at initStorage;
    f@withrevert(e1, args);

    assert !lastReverted;
}

rule whichChildFuseBlocksFunction(method f, bytes32 node, uint32 fuses) {
    env e1; env e2;
    calldataarg args;
    bytes32 parentNode;
    bytes32 labelhash;
    uint64 expiry;
    storage initStorage = lastStorage;

    f(e1, args);

    setChildFuses(e2, parentNode, labelhash, fuses, expiry) at initStorage;
    f@withrevert(e1, args);

    assert !lastReverted;
}
