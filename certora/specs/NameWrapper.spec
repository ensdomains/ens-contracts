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
    onERC1155BatchReceived(address, address, uint256[], uint256[], bytes) returns (bytes4) => DISPATCHER(true)
    
    // NameWrapper internal
    _getEthLabelhash(bytes32 node, uint32 fuses) returns(bytes32) => ghostLabelHash(node, fuses)

    // NameWrapper harness
    getLabelHashAndOffset(bytes) returns (bytes32,uint256) envfree
    getParentNodeByNode(bytes32) returns (bytes32) envfree
    getParentNodeByName(bytes) returns (bytes32) envfree
    makeNode(bytes32, bytes32) returns (bytes32) envfree
    makeNodeFromName(bytes) returns (bytes32) envfree
    tokenIDFromNode(bytes32) returns (uint256) envfree
    setData(uint256, address, uint32, uint64) envfree
    getExpiry(bytes32) returns (uint64)
    getLabelHash(string) returns (bytes32) envfree
    getDataSuper(uint256) returns (address, uint32, uint64) envfree

    // upgraded contract
    //setSubnodeRecord(bytes32, string, address, address, uint64, uint32, uint64) => DISPATCHER(true)
    //wrapETH2LD(string, address, uint32, uint64, address) => DISPATCHER(true)

    // ens
    ens.owner(bytes32) returns (address) envfree

    // BytesUtils munged
    _readLabelHash(bytes32, uint256, uint256) returns (bytes32) => NONDET
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

/**************************************************
*                 Ghosts & Hooks                 *
**************************************************/

ghost mapping(bytes32 => mapping(uint32 => bytes32)) labelHashMap;

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
    return e.block.timestamp > to_uint256(expiry);
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
    env e1;
    env e2;
    
    if(isEth) {
        string label; require label.length == 32;
        address wrappedOwner;
        uint16 ownerControlledFuses;
        address resolver;
        wrapETH2LD(e1, label, wrappedOwner, ownerControlledFuses, resolver);
        wrapETH2LD@withrevert(e2, label, wrappedOwner, ownerControlledFuses, resolver);
    }
    else {
        bytes name; require name.length == 32;
        address wrappedOwner;
        address resolver;
        wrap(e1, name, wrappedOwner, resolver);
        wrap@withrevert(e2, name, wrappedOwner, resolver);
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

// Verified
rule fusesAfterWrap(bytes name) {
    env e;
    require name.length == 32;

    bytes32 node = makeNodeFromName(name);
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

// Verified
rule fusesAfterWrapETHL2D(string label) {
    env e;
    require label.length == 32;

    bytes32 node = makeNode(ETH_NODE(), getLabelHash(label));
    uint256 tokenID = tokenIDFromNode(node);
    address wrappedOwner;
    uint16 ownerControlledFuses;
    address resolver;

    // Assuming first time wrap
    require _tokens(tokenID) == 0;

    wrapETH2LD(e, label, wrappedOwner, ownerControlledFuses, resolver);
   
    uint32 fuses; address owner; uint64 expiry;
    owner, fuses, expiry = getDataSuper(tokenID);

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
    uint32 fuses; address owner; uint64 expiry;
    uint256 tokenID = tokenIDFromNode(node);
    owner, fuses, expiry = getData(e, tokenID);

    require expired(e, node);
    renew@withrevert(e, tokenID, duration);
    
    assert lastReverted;
}

// setSubnodeOwner() and setSubnodeRecord() both revert when the subdomain is Emancipated or Locked.
rule setSubnodeRecordRevertsIfEmancipatedOrLocked(bytes32 parentNode) {
    env e;
    string label; require label.length == 32;
    bytes32 subnode = makeNode(parentNode, getLabelHash(label));
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

rule setSubnodeOwnerRevertsIfEmancipatedOrLocked(bytes32 parentNode) {
    env e;
    string label; require label.length == 32;
    bytes32 subnode = makeNode(parentNode, getLabelHash(label));
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

// https://vaas-stg.certora.com/output/41958/fe2a0dff3df412962288/?anonymousKey=f58c495410ed0d94180b622e0304409a673b103b
rule whoBurnsETHFuse(bytes32 node, method f) filtered{f-> !f.isView} {
    env e;
    calldataarg args;

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
