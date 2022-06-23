pragma solidity ^0.8.11;

import "../../../contracts/utils/OffchainMulticallable.sol";

interface IDoSomethingOffchain {
    function doSomethingOffchain(uint256 count) external view returns(uint256);
}

contract MulticallTestFixture is OffchainMulticallable {
    string[] internal batchgateways;
    string[] internal gateways;
    constructor(string[] memory _batchGateways, string[] memory _gateways) {
        batchgateways = _batchGateways;
        gateways = _gateways;
    }

    function batchGatewayURLs() internal override view returns(string[] memory) {
        return batchgateways;
    }

    function doSomethingOffchain(uint256 count) public view returns(uint256) {
        if(count < 5) {
            bytes memory callData = abi.encodeWithSelector(IDoSomethingOffchain.doSomethingOffchain.selector, count);
            revert OffchainLookup(
                address(this),
                gateways,
                callData,
                MulticallTestFixture.doSomethingOffchainCallback.selector,
                callData
            );
        }
        return count;
    }

    function doSomethingOffchainCallback(bytes calldata /* response */, bytes calldata extradata) external view returns(uint256) {
        uint256 count = abi.decode(extradata, (uint256));
        return doSomethingOffchain(count - 1);
    }
}