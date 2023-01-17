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

    // upgraded contract
    //setSubnodeRecord(bytes32, string, address, address, uint64, uint32, uint64) => DISPATCHER(true)
    //wrapETH2LD(string, address, uint32, uint64, address) => DISPATCHER(true)

    // ens
    ens.owner(bytes32) returns (address) envfree
    ens.isApprovedForAll(address, address) returns (bool) envfree

    // Registrar
    registrar.nameExpires(uint256) returns (uint256) envfree
    registrar.isApprovedForAll(address, address) returns (bool) envfree
    registrar.ownerOf(uint256) returns (address) envfree
    

    // BytesUtils munged
    //_readLabelHash(bytes32, uint256, uint256) returns (bytes32) => NONDET
}
/**************************************************
*                 Hashes Definitions              *
**************************************************/
definition ETH_NODE() returns bytes32 = 0x93cdeb708b7545dc668eb9280176169d1c33cfd8ed6f04690a0bcc88a93fc4ae;

/**************************************************
*                 Fuses Definitions               *
**************************************************/
definition CANNOT_UNWRAP() returns uint32 = 1;
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
*              Invariants                        *
**************************************************/
// https://vaas-stg.certora.com/output/41958/1638682c45a302391190/?anonymousKey=6b5b505f88b1c62263fc8380e1fd1089d52fd004
// "Expiry can only be less than or equal to the parent's expiry"
invariant expiryOfParentName(env e, bytes32 node, bytes32 parentNode, bytes32 labelhash)
    node == makeNode(parentNode, labelhash) => getExpiry(e, node) <= getExpiry(e, parentNode)
    filtered{f->f.selector == 
    registerAndWrapETH2LD(string, address, uint256, address, uint16).selector}
    {
        preserved with (env ep) {
            require ep.msg.sender == e.msg.sender;
            require registrar.nameExpires(tokenIDFromNode(node)) < 2^64;
            require registrar.nameExpires(tokenIDFromNode(parentNode)) < 2^64;
        }
    }

// https://vaas-stg.certora.com/output/41958/48bd520f6361487f1ca9/?anonymousKey=a17e7240a24066b62490308e62cbb99ab8925368
invariant ghostLabelHashConsistency(bytes32 node, uint32 fuses)
    getEthLabelhash(node) == ghostLabelHash(node, fuses)
    {
        preserved{
            ethLabelSetup(node);
        }
    }

/**************************************************
*              Wrapping Rules                     *
**************************************************/

//https://vaas-stg.certora.com/output/41958/cb2647f179963f0cfd2b/?anonymousKey=82556bf0f0342f3dc55d78c531d65763e6a7ed8f
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

// https://vaas-stg.certora.com/output/41958/a0f46548cc37c3f9cabd/?anonymousKey=fbe254745a3a6ac6516bd0f607c87da51440a57f
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

    // Assuming first time wrap
    require _tokens(tokenID) == 0;

    wrap(e, name, wrappedOwner, resolver);
   
    uint32 fuses; address owner; uint64 expiry;
    owner, fuses, expiry = getDataSuper(tokenID);

    assert (fuses & IS_DOT_ETH() != IS_DOT_ETH());
}

// Violated
rule fusesAfterWrapETHL2D(string label) {
    env e;
    calldataarg args;
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
   
    uint32 fuses; address owner; uint64 expiry;
    owner, fuses, expiry = getDataSuper(tokenID);

    bytes32 labelHash_; uint256 offset;
    labelHash_, offset = getLabelHashAndOffset(node);

    // This condition guarantees consistency (violated)
    assert labelHash_ == labelHash;
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

// Violated
rule setSubnodeRecordStateTransition(bytes32 node) {
    env e;
    string label;
    bytes32 labelhash = getLabelHash(label);
    bytes32 parentNode;
    address owner;
    address resolver;
    uint64 ttl;
    uint32 fuses;
    uint64 expiry;

    bool _unRegistered = unRegistered(e, node);
    bool _unWrapped = unWrapped(e, node);
    bool _wrapped = wrapped(e, node);
        bool preState = _unRegistered || _unWrapped || _wrapped;

    require node == makeNode(parentNode, labelhash);

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

// https://vaas-stg.certora.com/output/41958/aebaeeadddc5880230bb/?anonymousKey=47f040094d00117e522943b94f33bdcd75e06f9c
// "Only Emancipated names can be Locked ""
rule onlyEmancipatedCanBeLocked(method f, bytes32 node) 
filtered{f -> f.selector == setFuses(bytes32,uint16).selector}{
    env e;
    calldataarg args;

    ethLabelSetup(node);
    bool emancipatedBefore = emancipated(e, node);
    bool lockedBefore = locked(e, node);
        
        f(e, args);

    ethLabelSetup(node);
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

// setSubnodeOwner() and setSubnodeRecord() both revert when the subdomain is Emancipated or Locked.
rule setSubnodeRecordRevertsIfEmancipatedOrLocked(bytes32 parentNode) {
    env e;
    string label;
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
rule setSubnodeOwnerRevertsIfEmancipatedOrLocked(bytes32 parentNode) {
    env e;
    string label;
    require label.length == 32;
    bytes32 labelhash = getLabelHash(label);
    bytes32 subnode = makeNode(parentNode, labelhash);
    address owner;
    uint32 fuses;
    uint64 expiry;

    address owner1;
    uint32 fuses1;
    uint64 expiry1;
    owner1, fuses1, expiry1 = getData(e, tokenIDFromNode(subnode));

    require emancipated(e, subnode) || locked(e, subnode);
    ethLabelSetup(subnode);
    
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
/**************************************************
*              MISC Rules                         *
**************************************************/

rule sanity(method f) {
    calldataarg args;
    env e;
    f(e,args);
    assert false; 
}

rule makeNodeIsInjective(bytes32 labelHash1, bytes32 labelHash2) {
    bytes32 parentNode;
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
