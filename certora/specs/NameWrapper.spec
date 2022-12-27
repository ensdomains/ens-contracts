import "./erc20.spec"
using ENSRegistry as ens

/**************************************************
*                  Methods                       *
**************************************************/

methods {
    // NameWrapper
    ownerOf(uint256) returns (address) envfree
    allFusesBurned(bytes32, uint32) returns (bool) envfree

    // IERC1155
    onERC1155Received(address, address, uint256, uint256, bytes) returns (bytes4) => DISPATCHER(true)
    onERC721Received(address,address,uint256,bytes) => DISPATCHER(true)
    onERC1155BatchReceived(address, address, uint256[], uint256[], bytes) returns (bytes4) => DISPATCHER(true)
    
    // NameWrapper internal
    _getEthLabelhash(bytes32 node, uint32 fuses) returns(bytes32) => ghostLabelHash(node,fuses)
    //keccak(bytes name, uint256 offset, uint256) returns(bytes32)

    // NameWrapper harness
    getLabelHashAndOffset(bytes) returns (bytes32,uint256) envfree
    getParentNode(bytes, uint256) returns (bytes32) envfree
    makeNode(bytes32, bytes32) returns (bytes32) envfree
    makeNodeFromWord(bytes32) returns (bytes32) envfree
    tokenIDFromNode(bytes32) returns (uint256) envfree
    getNamesFirstWord(bytes32) returns (bytes32) envfree

    // upgraded contract
    //setSubnodeRecord(bytes32, string, address, address, uint64, uint32, uint64) => DISPATCHER(true)
    //wrapETH2LD(string, address, uint32, uint64, address) => DISPATCHER(true)

    // ens
    ens.owner(bytes32) returns (address) envfree
}

/**************************************************
*                 Fuses Definitions                *
**************************************************/
definition PARENT_CANNOT_CONTROL() returns uint32 = 2^16;
definition CANNOT_UNWRAP() returns uint32 = 1;

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

function unRegistered(bytes32 node) returns bool {
    address ownerOf = ownerOf(tokenIDFromNode(node));
    address ensOwner = ens.owner(node);
    return ownerOf == 0 && (ensOwner == 0 || ensOwner == currentContract);
}

function unWrapped(bytes32 node) returns bool {
    address ownerOf = ownerOf(tokenIDFromNode(node));
    address ensOwner = ens.owner(node);
    return ownerOf == 0 && (ensOwner != 0 && ensOwner != currentContract);
}

function wrapped(bytes32 node) returns bool {
    return ownerOf(tokenIDFromNode(node)) !=0;
}

function emancipated(bytes32 node) returns bool {
    return allFusesBurned(node, PARENT_CANNOT_CONTROL()) &&
            !allFusesBurned(node, CANNOT_UNWRAP());
}

function locked(bytes32 node) returns bool {
    return allFusesBurned(node, CANNOT_UNWRAP());
}

/**************************************************
*              Invariants                        *
**************************************************/
// https://vaas-stg.certora.com/output/41958/7cfd5e1c4a0a48b88ec49a590a3f4402/?anonymousKey=53297c6d94e2f9f2abd9f103c92cf4636d035f8a
invariant nameNodeConsistency(bytes32 node, bytes32 word)
    getNamesFirstWord(node) == word <=> node == makeNodeFromWord(word)

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

rule wrapUnwrap(bytes name) {
    env e;
    address controller; address resolver;
    bytes32 labelhash; uint256 offset;
    address wrappedOwner;
    require name.length == 32;

    labelhash, offset = getLabelHashAndOffset(name);
    bytes32 parentNode = getParentNode(name, offset);
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
    
    bool isWrapped = wrapped(node);
        f(e, args);
    bool isUnwrapped = unWrapped(node);
    require isWrapped && isUnwrapped;
    assert false;
}

rule whoTurnedUnwrappedToWrapped(method f, bytes32 node) 
filtered {f -> !f.isView} {
    env e;
    calldataarg args;
    
    bool isUnwrapped = unWrapped(node);
        f(e, args);
    bool isWrapped = wrapped(node);
    require isWrapped && isUnwrapped;
    assert false;
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
