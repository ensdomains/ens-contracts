import "./erc20.spec"

methods {
    // IERC1155
    onERC1155Received(address, address, uint256, uint256, bytes) returns (bytes4) => DISPATCHER(true)
    onERC721Received(address,address,uint256,bytes) => DISPATCHER(true)
    onERC1155BatchReceived(address, address, uint256[], uint256[], bytes) returns (bytes4) => DISPATCHER(true)
    
    // upgraded contract
    setSubnodeRecord(bytes32, string, address, address, uint64, uint32, uint64) => DISPATCHER(true)
    wrapETH2LD(string, address, uint32, uint64, address) => DISPATCHER(true)
}

rule sanity(method f) {
    calldataarg args;
    env e;

    f(e,args);
    assert false; 
}

rule customSanity(method f) filtered{f -> 
f.selector == upgrade(bytes32,string,address,address).selector
||
f.selector == upgradeETH2LD(string,address,address).selector} {
    calldataarg args;
    env e;

    f(e,args);
    assert false; 
}