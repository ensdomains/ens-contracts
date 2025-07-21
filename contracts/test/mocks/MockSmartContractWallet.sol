//SPDX-License-Identifier: MIT
pragma solidity >=0.8.17 <0.9.0;
// import signatureVerifier by openzepellin
import "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";

contract MockSmartContractWallet {
    address public owner;

    constructor(address _owner) {
        owner = _owner;
    }

    function isValidSignature(
        bytes32 hash,
        bytes memory signature
    ) public view returns (bytes4) {
        if (SignatureChecker.isValidSignatureNow(owner, hash, signature)) {
            return 0x1626ba7e;
        }
        return 0xffffffff;
    }
}
