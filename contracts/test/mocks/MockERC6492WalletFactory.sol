//SPDX-License-Identifier: MIT
pragma solidity >=0.8.17 <0.9.0;
// import signatureVerifier by openzepellin
import {SignatureChecker} from "@openzeppelin/contracts-v5/utils/cryptography/SignatureChecker.sol";
import {MockSmartContractWallet} from "./MockSmartContractWallet.sol";

contract MockERC6492WalletFactory {
    error Create2Failed();

    bytes32 private constant SALT =
        0x00000000000000000000000000000000000000000000000000000000cafebabe;

    function getInitCode(address owner) private pure returns (bytes memory) {
        return
            abi.encodePacked(
                type(MockSmartContractWallet).creationCode,
                bytes32(uint256(uint160(owner)))
            );
    }

    function predictAddress(address owner) public view returns (address) {
        return
            address(
                uint160(
                    uint256(
                        keccak256(
                            abi.encodePacked(
                                bytes1(0xff),
                                address(this),
                                SALT,
                                keccak256(getInitCode(owner))
                            )
                        )
                    )
                )
            );
    }

    function createWallet(address owner) public returns (address addr) {
        bytes memory bytecode = getInitCode(owner);
        assembly ("memory-safe") {
            addr := create2(0, add(bytecode, 0x20), mload(bytecode), SALT)
            // if no address was created, and returndata is not empty, bubble revert
            if and(iszero(addr), not(iszero(returndatasize()))) {
                let p := mload(0x40)
                returndatacopy(p, 0, returndatasize())
                revert(p, returndatasize())
            }
        }

        if (addr == address(0)) revert Create2Failed();
    }
}
