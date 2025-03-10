// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {Test} from "forge-std/Test.sol";

import {ENSIP19} from "../../contracts/utils/ENSIP19.sol";
import {DNSCoder} from "../../contracts/utils/DNSCoder.sol";

contract TestENSIP19 is Test {
    function test_chainFromCoinType() external pure {
        assertEq(ENSIP19.chainFromCoinType(60), 1);
        assertEq(ENSIP19.chainFromCoinType(0x8000_0000), 0);
        assertEq(ENSIP19.chainFromCoinType(0x8000_0000 | 8453), 8453);
        assertEq(ENSIP19.chainFromCoinType(0), 0);
        assertEq(ENSIP19.chainFromCoinType(1), 0);
    }

    function test_dnsReverseName_fromChain() external pure {
        address a = 0x51050ec063d393217B436747617aD1C2285Aeeee;
        assertEq(
            ENSIP19.dnsReverseName(a, 1),
            DNSCoder.encode(
                "51050ec063d393217b436747617ad1c2285aeeee.addr.reverse"
            )
        );
        assertEq(
            ENSIP19.dnsReverseName(a, 0),
            DNSCoder.encode(
                "51050ec063d393217b436747617ad1c2285aeeee.default.reverse"
            )
        );
        assertEq(
            ENSIP19.dnsReverseName(a, 8453),
            DNSCoder.encode(
                "51050ec063d393217b436747617ad1c2285aeeee.80002105.reverse"
            )
        );
    }

    function test_dnsReverseName_fromCoinType() external pure {
        bytes memory a = hex"51050ec063d393217B436747617aD1C2285Aeeee";
        assertEq(
            ENSIP19.dnsReverseName(a, 60),
            DNSCoder.encode(
                "51050ec063d393217b436747617ad1c2285aeeee.addr.reverse"
            )
        );
        assertEq(
            ENSIP19.dnsReverseName(a, 0x8000_0000),
            DNSCoder.encode(
                "51050ec063d393217b436747617ad1c2285aeeee.default.reverse"
            )
        );
        assertEq(
            ENSIP19.dnsReverseName(a, 0),
            DNSCoder.encode(
                "51050ec063d393217b436747617ad1c2285aeeee.0.reverse"
            )
        );
        assertEq(
            ENSIP19.dnsReverseName(a, 1),
            DNSCoder.encode(
                "51050ec063d393217b436747617ad1c2285aeeee.1.reverse"
            )
        );
    }
}
