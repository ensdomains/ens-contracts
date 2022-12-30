import "./erc20.spec"
using ENSRegistry as ens

/**************************************************
*                  Methods                       *
**************************************************/

methods {
    // NameWrapper
    ownerOf(uint256) returns (address)
    allFusesBurned(bytes32, uint32) returns (bool)
    _tokens(uint256) returns (uint256) envfree
    controllers(address) returns (bool) envfree

    // IERC1155
    onERC1155Received(address, address, uint256, uint256, bytes) returns (bytes4) => DISPATCHER(true)
    onERC721Received(address,address,uint256,bytes) => DISPATCHER(true)
    onERC1155BatchReceived(address, address, uint256[], uint256[], bytes) returns (bytes4) => DISPATCHER(true)
    
    // NameWrapper internal
    _getEthLabelhash(bytes32 node, uint32 fuses) returns(bytes32) => ghostLabelHash(node,fuses)
    //keccak(bytes name, uint256 offset, uint256) returns(bytes32)

    // NameWrapper harness
    getLabelHashAndOffset(bytes) returns (bytes32,uint256) envfree
    getParentNodeByNode(bytes32) returns (bytes32) envfree
    getParentNodeByName(bytes) returns (bytes32) envfree
    makeNode(bytes32, bytes32) returns (bytes32) envfree
    tokenIDFromNode(bytes32) returns (uint256) envfree
    setData(uint256, address, uint32, uint64) envfree
    getExpiry(bytes32) returns (uint64)
    getLabelHash(string) returns (bytes32) envfree

    // upgraded contract
    //setSubnodeRecord(bytes32, string, address, address, uint64, uint32, uint64) => DISPATCHER(true)
    //wrapETH2LD(string, address, uint32, uint64, address) => DISPATCHER(true)

    // ens
    ens.owner(bytes32) returns (address) envfree

    // BytesUtils munged
    _readLabelHash(bytes32, uint256, uint256) returns (bytes32) => NONDET
    _readLabelNewIdx(bytes32, uint256, uint256) returns (uint256) => NONDET 
}

/**************************************************
*                 Fuses Definitions                *
**************************************************/
definition CANNOT_UNWRAP() returns uint32 = 1;
definition PARENT_CANNOT_CONTROL() returns uint32 = 2^16;
definition IS_DOT_ETH() returns uint32 = 2^17;

/**************************************************
*                 Ghosts & Hooks                 *
**************************************************/

ghost mapping(bytes32 => mapping(uint32 => bytes32)) labelHashMap ;
ghost mapping(bytes32 => bytes32) nodeFromWordhMap;
ghost mapping(bytes32 => bytes32) wordFromNodehMap;

function ghostLabelHash(bytes32 labelHash, uint32 fuses) returns bytes32 {
    return labelHashMap[labelHash][fuses];
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
    return e.block.timestamp > expiry;
}

/**************************************************
*              Invariants                        *
**************************************************/
// https://vaas-stg.certora.com/output/41958/7cfd5e1c4a0a48b88ec49a590a3f4402/?anonymousKey=53297c6d94e2f9f2abd9f103c92cf4636d035f8a
//invariant nameNodeConsistency(bytes32 node, bytes32 word)
//    getNamesFirstWord(node) == word <=> node == makeNodeFromWord(word)

// "Expiry can only be less than or equal to the parent's expiry"
invariant expiryOfParentName(env e, bytes32 node, bytes32 parentNode, bytes32 labelhash)
    getExpiry(e, node) <= getExpiry(e, parentNode)
    {
        preserved with (env ep) {
            require ep.msg.sender == e.msg.sender;
            require node == makeNode(parentNode, labelhash);
        }
    }
/**************************************************
*              Wrapping Rules                     *
**************************************************/

rule cannotWrapTwice(bool isEth) {
    env e;

    if(isEth) {
        string label; require label.length == 32;
        address wrappedOwner;
        uint16 ownerControlledFuses;
        address resolver;
        wrapETH2LD(e, label, wrappedOwner, ownerControlledFuses, resolver);
        wrapETH2LD@withrevert(e, label, wrappedOwner, ownerControlledFuses, resolver);
    }
    else {
        bytes name; require name.length == 32;
        address wrappedOwner;
        address resolver;
        wrap(e, name, wrappedOwner, resolver);
        wrap@withrevert(e, name, wrappedOwner, resolver);
    }
    assert lastReverted;
}

rule wrapUnwrap(bytes32 node) {
    env e;
    address controller; address resolver;
    bytes32 labelhash; uint256 offset;
    address wrappedOwner;
    bytes name; 
    bytes32 parentNode = getParentNodeByNode(node);
    require getParentNodeByName(name) == parentNode;

    storage initStorage = lastStorage;

    unwrap(e, parentNode, labelhash, controller);
    bytes32 node1 = makeNode(parentNode, labelhash);
    bool canModify1 = canModifyName(e, node1, e.msg.sender);

    wrap(e, name, wrappedOwner, resolver) at initStorage;
    bytes32 node2 = makeNode(parentNode, labelhash);
    bool canModify2 = canModifyName(e, node2, e.msg.sender);

    unwrap@withrevert(e, parentNode, labelhash, controller);
    assert !lastReverted;
}
/**************************************************
*              TRANSITION Rules                   *
**************************************************/

rule whoTurnedWrappedToUnWrapped(method f, bytes32 node) 
filtered {f -> !f.isView} {
    env e;
    calldataarg args;

    uint32 fuseMask;
    requireInvariant fusesNotBurntAfterExpiration(e, node, fuseMask);
    
    bool isWrapped = wrapped(e, node);
        f(e, args);
    bool isUnwrapped = unWrapped(e, node);
    require isWrapped && isUnwrapped;
    assert false;
}

rule whoTurnedUnwrappedToWrapped(method f, bytes32 node) 
filtered {f -> !f.isView} {
    env e;
    calldataarg args;
    
    uint32 fuseMask;
    requireInvariant fusesNotBurntAfterExpiration(e, node, fuseMask);
    
    bool isUnwrapped = unWrapped(e, node);
        f(e, args);
    bool isWrapped = wrapped(e, node);
    require isWrapped && isUnwrapped;
    assert false;
}

rule setSubnodeRecordStateTransition(string label, bytes32 node) {
    env e;
    bytes32 labelhash = getLabelHash(label);
    bytes32 parentNode;
    address owner;
    address resolver;
    uint64 ttl;
    uint32 fuses;
    uint64 expiry;
    
    bool preState = unRegistered(e, node) || wrapped(e, node) || unWrapped(e, node);

    require node == makeNode(parentNode, labelhash);
    setSubnodeRecord(e, parentNode, label, owner,
        resolver, ttl, fuses, expiry);

    bool postState = wrapped(e, node) || emancipated(e, node) || locked(e, node);

    assert preState && postState;
}

/**************************************************
*              REVERT Rules                       *
**************************************************/

rule cannotRenewExpiredName(bytes32 node) {
    env e;
    uint256 duration;
    uint32 fuses;
    uint256 tokenID = tokenIDFromNode(node);
    require expired(e, node);
    renew@withrevert(e, tokenID, duration);
    
    assert lastReverted;
}

rule setSubnodeRecordRevertsIfEmancipatedOrLocked(bytes32 parentNode) {
    env e;
    string label;
    address owner;
    address resolver;
    uint64 ttl;
    uint32 fuses;
    uint64 expiry;
    require emancipated(e, parentNode) || locked(e, parentNode);

    setSubnodeRecord@withrevert(e, parentNode, label, owner,
        resolver, ttl, fuses, expiry);

    assert lastReverted;
}

rule setSubnodeOwnerRevertsIfEmancipatedOrLocked(bytes32 parentNode) {
    env e;
    string label;
    address owner;
    uint32 fuses;
    uint64 expiry;
    require emancipated(e, parentNode) || locked(e, parentNode);

    setSubnodeOwner@withrevert(e, parentNode, label, owner, fuses, expiry);

    assert lastReverted;
}

/**************************************************
*              FUSES Rules                        *
**************************************************/
// https://vaas-stg.certora.com/output/41958/b421badbcd774bae90e38a1d815cfd3d/?anonymousKey=c1f7988fc014ab7999d2c3df06b08a13f574695c
// Verified
invariant fusesNotBurntAfterExpiration(env e, bytes32 node, uint32 fuseMask)
    (expired(e, node) && fuseMask != 0) => !allFusesBurned(e, node, fuseMask)
    {
        preserved with (env ep){
            require ep.block.timestamp == e.block.timestamp;
        }
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
