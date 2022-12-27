import "./erc20.spec"

methods {
    // IERC1155
    onERC1155Received(address, address, uint256, uint256, bytes) returns (bytes4) => DISPATCHER(true)
    onERC721Received(address,address,uint256,bytes) => DISPATCHER(true)
    onERC1155BatchReceived(address, address, uint256[], uint256[], bytes) returns (bytes4) => DISPATCHER(true)
    
    // NameWrapper internal
    _getEthLabelhash(bytes32 node, uint32 fuses) returns(bytes32) => ghostLabelHash(node,fuses)

    // NameWrapper harness
    getLabelHashAndOffset(bytes) returns (bytes32,uint256) envfree
    getParentNode(bytes, uint256) returns (bytes32) envfree
    makeNode(bytes32, bytes32) returns (bytes32) envfree

    // upgraded contract
    //setSubnodeRecord(bytes32, string, address, address, uint64, uint32, uint64) => DISPATCHER(true)
    //wrapETH2LD(string, address, uint32, uint64, address) => DISPATCHER(true)
}

ghost ghostLabelHash(bytes32, uint32) returns bytes32;

rule sanity(method f) {
    calldataarg args;
    env e;

    f(e,args);
    assert false; 
}

rule cannotWrapTwice(bool isEth) {
    env e;
    calldataarg args;

    if(isEth) {
        wrapETH2LD(e, args);
        wrapETH2LD@withrevert(e, args);
    }
    else {
        wrap(e, args);
        wrap@withrevert(e, args);
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
