pragma solidity ^0.8.4;

/**
 * @dev Interface for contracts that implement NSEC3 digest algorithms.
 */
interface NSEC3Digest {
    /**
     * @dev Performs an NSEC3 iterated hash.
     * @param salt The salt value to use on each iteration.
     * @param data The data to hash.
     * @param iterations The number of iterations to perform.
     * @return The result of the iterated hash operation.
     */
     function hash(bytes calldata salt, bytes calldata data, uint iterations) external virtual pure returns (bytes32);
}
