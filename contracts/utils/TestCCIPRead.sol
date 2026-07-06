// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {EIP3668, OffchainLookup} from "../ccipRead/EIP3668.sol";
import {CCIPReader} from "../ccipRead/CCIPReader.sol";
import {CCIPBatcher} from "../ccipRead/CCIPBatcher.sol";

contract TestCCIPRead is CCIPBatcher {
    constructor() CCIPReader(0) {}

    ////////////////////////////////////////////////////////////////////////
    // EIP3668
    ////////////////////////////////////////////////////////////////////////

    function _createParams() internal pure returns (EIP3668.Params memory p) {
        p.sender = address(1);
        p.urls = new string[](2);
        p.callData = "abc";
        p.callbackFunction = 0x12345678;
        p.extraData = "def";
    }
    function revertOffchainLookup(EIP3668.Params memory p) external pure {
        revert OffchainLookup(
            p.sender,
            p.urls,
            p.callData,
            p.callbackFunction,
            p.extraData
        );
    }
    function drop4(bytes calldata v) external pure returns (bytes memory) {
        return v[4:];
    }
    function test_decode() external view {
        EIP3668.Params memory p = _createParams();
        try this.revertOffchainLookup(p) {
            revert("bug");
        } catch (bytes memory err) {
            require(
                keccak256(abi.encode(EIP3668.decode(this.drop4(err)))) ==
                    keccak256(abi.encode(p))
            );
        }
    }

    ////////////////////////////////////////////////////////////////////////
    // CCIPReader
    ////////////////////////////////////////////////////////////////////////

    function test_decodeOffchainLookup() external view {
        EIP3668.Params memory p = _createParams();
        try this.revertOffchainLookup(p) {
            revert("bug");
        } catch (bytes memory err) {
            require(
                keccak256(abi.encode(decodeOffchainLookup(err))) ==
                    keccak256(abi.encode(p))
            );
        }
    }

    function test_detectEIP140_self() external view {
        require(detectEIP140(address(this)));
    }
    function test_detectEIP140_before() external {
        require(!detectEIP140(address(new MockInvalid())));
    }
    function test_detectEIP140_after() external {
        require(detectEIP140(address(new MockRevert())));
    }

    ////////////////////////////////////////////////////////////////////////
    // CCIPBatcher
    ////////////////////////////////////////////////////////////////////////

    function test_ccipBatch_done() external view {
        this.ccipBatch(Batch(new Lookup[](0), new string[](0)));
    }

    function test_ccipBatchCallback_batchError() external view {
        bool[] memory failures = new bool[](1);
        failures[0] = true;
        bytes[] memory responses = new bytes[](1);
        Lookup[] memory lookups = new Lookup[](1);
        Batch memory batch = this.ccipBatchCallback(
            abi.encode(failures, responses),
            abi.encode(Batch(lookups, new string[](0)))
        );
        require(batch.lookups[0].flags == FLAG_DONE | FLAG_BATCH_ERROR);
    }

    function callbackSuccess(
        bytes calldata,
        bytes calldata
    ) external pure returns (uint256, string memory) {
        return (123, "abc");
    }
    function test_ccipBatchCallback_callbackSuccess() external view {
        bool[] memory failures = new bool[](1);
        bytes[] memory responses = new bytes[](1);
        Lookup[] memory lookups = new Lookup[](1);
        lookups[0].target = address(this);
        lookups[0].data = abi.encodeWithSelector(
            OffchainLookup.selector,
            address(this),
            new string[](0),
            "",
            this.callbackSuccess.selector,
            ""
        );
        Batch memory batch = this.ccipBatchCallback(
            abi.encode(failures, responses),
            abi.encode(Batch(lookups, new string[](0)))
        );
        require(batch.lookups[0].flags == FLAG_DONE);
    }

    function callbackEmpty(bytes calldata, bytes calldata) external pure {}
    function test_ccipBatchCallback_callbackEmpty() external view {
        bool[] memory failures = new bool[](1);
        bytes[] memory responses = new bytes[](1);
        Lookup[] memory lookups = new Lookup[](1);
        lookups[0].target = address(this);
        lookups[0].data = abi.encodeWithSelector(
            OffchainLookup.selector,
            address(this),
            new string[](0),
            "",
            this.callbackEmpty.selector,
            ""
        );
        Batch memory batch = this.ccipBatchCallback(
            abi.encode(failures, responses),
            abi.encode(Batch(lookups, new string[](0)))
        );
        require(
            batch.lookups[0].flags ==
                FLAG_DONE | FLAG_CALL_ERROR | FLAG_EMPTY_RESPONSE
        );
    }

    function callbackFailure(bytes calldata, bytes calldata) external pure {
        revert("fail");
    }
    function test_ccipBatchCallback_callbackFailure() external view {
        bool[] memory failures = new bool[](1);
        bytes[] memory responses = new bytes[](1);
        Lookup[] memory lookups = new Lookup[](1);
        lookups[0].target = address(this);
        lookups[0].data = abi.encodeWithSelector(
            OffchainLookup.selector,
            address(this),
            new string[](0),
            "",
            this.callbackFailure.selector,
            ""
        );
        Batch memory batch = this.ccipBatchCallback(
            abi.encode(failures, responses),
            abi.encode(Batch(lookups, new string[](0)))
        );
        require(batch.lookups[0].flags == FLAG_DONE | FLAG_CALL_ERROR);
    }

    function test_ccipBatchCallback_responseSizeMismatch() external view {
        try
            this.ccipBatchCallback(
                abi.encode(new bool[](1), new bytes[](2)),
                ""
            )
        returns (Batch memory) {
            revert("bug");
        } catch (bytes memory err) {
            require(bytes4(err) == InvalidBatchGatewayResponse.selector);
        }
    }

    function test_ccipBatchCallback_expectedSizeMismatch() external view {
        try
            this.ccipBatchCallback(
                abi.encode(new bool[](0), new bytes[](0)),
                abi.encode(Batch(new Lookup[](1), new string[](0)))
            )
        returns (Batch memory) {
            revert("bug");
        } catch (bytes memory err) {
            require(bytes4(err) == InvalidBatchGatewayResponse.selector);
        }
    }

    function test_toResponseArray_paddedErrors() external pure {
        Lookup[] memory lookups = new Lookup[](1);
        lookups[0].flags = FLAGS_ANY_ERROR;
        {
            bytes[] memory m = _toResponseArray(lookups, false);
            require(m[0].length == 0);
        }
        for (uint256 i = 1; i < 100; ++i) {
            lookups[0].data = new bytes(i);
            bytes[] memory m = _toResponseArray(lookups, false);
            require((m[0].length % 32) == 4);
        }
    }

    function test_toResponseArray_unwrapped() external pure {
        Lookup[] memory lookups = new Lookup[](1);
        for (uint256 i; i < 100; ++i) {
            lookups[0].data = new bytes(i);
            bytes[] memory m = _toResponseArray(lookups, false);
            require(m[0].length == i);
        }
    }

    function test_toResponseArray_wrapped() external pure {
        Lookup[] memory lookups = new Lookup[](1);
        for (uint256 i; i < 100; ++i) {
            bytes memory v = new bytes(i);
            lookups[0].data = abi.encode(v);
            bytes[] memory m = _toResponseArray(lookups, true);
            require(keccak256(m[0]) == keccak256(v));
        }
    }
}

contract MockInvalid {
    fallback() external {
        assembly {
            invalid()
        }
    }
}

contract MockRevert {
    fallback() external {
        assembly {
            revert(0, 0)
        }
    }
}
