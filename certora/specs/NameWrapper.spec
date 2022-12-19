import "./erc20.spec"

methods {
    // IERC1155
    onERC1155Received(address, address, uint256, uint256, bytes) returns (bytes4) => DISPATCHER(true)
    onERC721Received(address,address,uint256,bytes) => DISPATCHER(true)
    onERC1155BatchReceived(address, address, uint256[], uint256[], bytes) returns (bytes4) => DISPATCHER(true)
    
    // ens
    //setSubnodeRecord(bytes32, bytes32, address, address, uint64) => DISPATCHER(true)
   // wrapETH2LD(string, address, uint16, address) => DISPATCHER(true)
}

rule sanity(method f) {
    calldataarg args;
    env e;

    f(e,args);
    assert false; 
}