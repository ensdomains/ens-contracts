// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {Test} from "forge-std/Test.sol";

import {ENSIP19} from "../../contracts/utils/ENSIP19.sol";
import {NameEncoder} from "../../contracts/utils/NameEncoder.sol";

contract TestENSIP19 is Test {
    function test_isEVMCoinType() external pure {
        assertTrue(ENSIP19.isEVMCoinType(60), "addr");
        assertTrue(ENSIP19.isEVMCoinType(0x8000_0000), "default");
        assertTrue(ENSIP19.isEVMCoinType(0x8000_0000 | 8453), "base");
        assertFalse(ENSIP19.isEVMCoinType(0), "null");
        assertFalse(ENSIP19.isEVMCoinType(1), "corn");
    }

    function test_dnsReverseName_fromChain() external pure {
        address a = 0x51050ec063d393217B436747617aD1C2285Aeeee;
        assertEq(
            ENSIP19.dnsReverseName(a, 1),
            _dns("51050ec063d393217b436747617ad1c2285aeeee.addr.reverse")
        );
        assertEq(
            ENSIP19.dnsReverseName(a, 0),
            _dns("51050ec063d393217b436747617ad1c2285aeeee.default.reverse")
        );
        assertEq(
            ENSIP19.dnsReverseName(a, 8453),
            _dns("51050ec063d393217b436747617ad1c2285aeeee.80002105.reverse")
        );
    }

    function test_dnsReverseName_fromCoinType() external pure {
        bytes memory a = hex"51050ec063d393217B436747617aD1C2285Aeeee";
        assertEq(
            ENSIP19.dnsReverseName(a, 60),
            _dns("51050ec063d393217b436747617ad1c2285aeeee.addr.reverse")
        );
        assertEq(
            ENSIP19.dnsReverseName(a, 0x8000_0000),
            _dns("51050ec063d393217b436747617ad1c2285aeeee.default.reverse")
        );
        assertEq(
            ENSIP19.dnsReverseName(a, 0),
            _dns("51050ec063d393217b436747617ad1c2285aeeee.0.reverse")
        );
        assertEq(
            ENSIP19.dnsReverseName(a, 1),
            _dns("51050ec063d393217b436747617ad1c2285aeeee.1.reverse")
        );
    }

    function _dns(string memory ens) internal pure returns (bytes memory dns) {
        (dns, ) = NameEncoder.dnsEncodeName(ens);
    }
}
