// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {Test} from "forge-std/Test.sol";

import {DNSCoder, DNSEncodingFailed, DNSDecodingFailed} from "../../contracts/utils/DNSCoder.sol";

/// forge-config: default.allow_internal_expect_revert = true
contract TestDNSCoder is Test {
    function test_root() external pure {
        _testValid("", hex"00");
    }

    function test_eth() external pure {
        _testValid("eth", "\x03eth\x00");
    }

    function test_vitalik_eth() external pure {
        _testValid("vitalik.eth", "\x07vitalik\x03eth\x00");
    }

    function test_a_bb_ccc_dddd_eeeee_ffffff() external pure {
        _testValid(
            "a.bb.ccc.dddd.eeeee.ffffff",
            "\x01a\x02bb\x03ccc\x04dddd\x05eeeee\x06ffffff\x00"
        );
    }

    function test_emptyLabel() external {
        _testInvalidENS(".");
        _testInvalidENS("..");
        _testInvalidENS("a.");
        _testInvalidENS(".b");
        _testInvalidENS("a..b");
    }

    function test_labelTooLong() external {
        bytes memory a = bytes("a");
        while (a.length < 256) a = bytes.concat(a, a);
        _testInvalidENS(string(a));
    }

    function test_wrongLength() external {
        _testInvalidDNS("\xFFabc\x00");
    }

    function test_labelWithStop() external {
        _testInvalidDNS("\x03a.b\x00");
    }

    function test_malformedEncoding() external {
        _testInvalidDNS(hex"");
        _testInvalidDNS(hex"02");
        _testInvalidDNS(hex"0000");
        _testInvalidDNS(hex"0100");
    }

    function _testValid(string memory ens, bytes memory dns) internal pure {
        assertEq(DNSCoder.decode(dns), ens);
        assertEq(DNSCoder.encode(ens), dns);
    }

    function _testInvalidENS(string memory ens) internal {
        vm.expectRevert(
            abi.encodeWithSelector(DNSEncodingFailed.selector, ens)
        );
        DNSCoder.encode(ens);
    }

    function _testInvalidDNS(bytes memory dns) internal {
        vm.expectRevert(
            abi.encodeWithSelector(DNSDecodingFailed.selector, dns)
        );
        DNSCoder.decode(dns);
    }
}
