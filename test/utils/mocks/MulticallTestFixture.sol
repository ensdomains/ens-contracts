pragma solidity ^0.8.11;

import "../../../contracts/utils/OffchainMulticallable.sol";

contract MulticallTestFixture is OffchainMulticallable {
    string[] internal gatewayURLs;

    constructor(string[] memory _batchGatewayURLs) {
        gatewayURLs = _batchGatewayURLs;
    }

    function batchGatewayURLs() internal override view returns(string[] memory) {
        return gatewayURLs;
    }

    function doSomethingOffchain(uint256 count) public view returns(uint256) {
        if(count > 0) {
            string[] memory urls = new string[](1);
            urls[0] = "https://example.com/";
            revert OffchainLookup(
                address(this),
                urls,
                "",
                MulticallTestFixture.doSomethingOffchainCallback.selector,
                abi.encode(count));
        }
        return count;
    }

    function doSomethingOffchainCallback(bytes calldata /* response */, bytes calldata extradata) external view returns(uint256) {
        uint256 count = abi.decode(extradata, (uint256));
        return doSomethingOffchain(count - 1);
    }
}