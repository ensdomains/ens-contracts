pragma solidity ^0.8.4;

import "@ensdomains/buffer/contracts/Buffer.sol";


library ModexpPrecompile {
    using Buffer for *;

    /**
    * @dev Computes (base ^ exponent) % modulus over big numbers.
    */
    function modexp(bytes memory base, bytes memory exponent, bytes memory modulus) internal view returns (bool success, bytes memory output) {
        uint size = (32 * 3) + base.length + exponent.length + modulus.length;

        Buffer.buffer memory input;
        input.init(size);

        input.appendBytes32(bytes32(base.length));
        input.appendBytes32(bytes32(exponent.length));
        input.appendBytes32(bytes32(modulus.length));
        input.append(base);
        input.append(exponent);
        input.append(modulus);

        output = new bytes(modulus.length);

        assembly {
            success := staticcall(gas(), 5, add(mload(input), 32), size, add(output, 32), mload(modulus))
        }
    }
}
