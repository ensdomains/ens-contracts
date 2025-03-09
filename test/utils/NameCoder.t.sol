// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {Test} from "forge-std/Test.sol";

import {NameDecoder, MalformedDNSEncoding} from "../../contracts/utils/NameDecoder.sol";
import {NameEncoder} from "../../contracts/utils/NameEncoder.sol";
import {BytesUtils} from "../../contracts/utils/BytesUtils.sol";

contract TestNameDecoder is Test {

   function test_root() external pure {
        _testValid("", hex"00", 0x000000000000000000000000000000000000000000000000000000000000000000);
    }

    function test_eth() external pure {
        _testValid("eth", hex"0365746800", 0x93cdeb708b7545dc668eb9280176169d1c33cfd8ed6f04690a0bcc88a93fc4ae);
    }

    function test_raffy_eth() external pure {
        _testValid(
            "raffy.eth", hex"0572616666790365746800", 0x9c8b7ac505c9f0161bbbd04437fce8c630a0886e1ffea00078e298f063a8a5df
        );
    }

    function test_a_bb_ccc_dddd_eeeee_ffffff() external pure {
        _testValid(
            "a.bb.ccc.dddd.eeeee.ffffff",
            hex"01610262620363636304646464640565656565650666666666666600",
            0x67708687406f50102b1dd9042f5c76f017b1ddfb9086878e4dedb9e0a4ff60d1
        );
    }

    function test_emptyLabel() external {
        _testInvalidENS(".");
        _testInvalidENS("..");
        _testInvalidENS("a.");
        _testInvalidENS(".b");
        _testInvalidENS("a..b");
    }

    function test_largeLabel() external {
        bytes memory a = bytes("a");
        while (a.length < 256) a = bytes.concat(a, a);
        _testInvalidENS(string(a));
    }

    function test_labelWithStop() external {
        _testMalformedDNS(bytes("\x03a.b\x00"));
    }

    function test_malformedEncoding() external {
        _testMalformedDNS(hex"");
        _testMalformedDNS(hex"02");
        _testMalformedDNS(hex"0000");
        _testMalformedDNS(hex"0100");
    }

    function _testValid(string memory ens, bytes memory dns, bytes32 node) internal pure {
        assertEq(NameDecoder.dnsDecodeName(dns), ens);
		(bytes memory dnsComputed, bytes32 nodeComputed) = NameEncoder.dnsEncodeName(ens);
        assertEq(dnsComputed, dns);
        assertEq(nodeComputed, BytesUtils.namehash(dns, 0));
    }

	/// forge-config: default.allow_internal_expect_revert = true
    function _testInvalidENS(string memory ens) internal {
        vm.expectRevert();
        NameEncoder.dnsEncodeName(ens);
    }

    function _testMalformedDNS(bytes memory dns) internal {
        vm.expectRevert(abi.encodeWithSelector(MalformedDNSEncoding.selector, dns));
        NameDecoder.dnsDecodeName(dns);
    }
}
