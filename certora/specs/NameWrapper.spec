import "./erc20.spec"

methods {
    // IERC1155
    onERC1155Received(address, address, uint256, uint256, bytes) returns (bytes4) => DISPATCHER(true)
    onERC721Received(address,address,uint256,bytes) => DISPATCHER(true)
    onERC1155BatchReceived(address, address, uint256[], uint256[], bytes) returns (bytes4) => DISPATCHER(true)
    
    // NameWrapper internal
    _getEthLabelhash(bytes32 node, uint32 fuses) returns(bytes32) => ghostLabelHash(node,fuses)

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
