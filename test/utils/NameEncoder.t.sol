// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {Test} from "forge-std/Test.sol";

import {NameEncoder} from "../../contracts/utils/NameEncoder.sol";
import {DNSCoder} from "../../contracts/utils/DNSCoder.sol";

contract TestNameEncoder is Test {
    function test_theseSeemWrong() external pure {
        assertEq(_encode(""), hex"0000");
        assertEq(_encode("."), hex"000000");
        assertEq(_encode(".."), hex"00000000");
        assertEq(_encode("eth."), hex"036574680000");
        assertEq(_encode(".eth"), hex"000365746800");
        assertEq(_encode("vitalik...eth"), hex"07766974616c696b00000365746800");
    }

    function testFuzz(uint8 n) external {
        vm.assume(n < 10);
        string memory ens = "eth";
        for (uint256 i; i < n; i++) {
            ens = string(
                abi.encodePacked(new bytes(vm.randomUint(1, 255)), ".", ens)
            );
        }
        assertEq(_encode(ens), DNSCoder.encode(ens));
    }

    function _encode(
        string memory ens
    ) internal pure returns (bytes memory dns) {
        (dns, ) = NameEncoder.dnsEncodeName(ens);
    }
}
