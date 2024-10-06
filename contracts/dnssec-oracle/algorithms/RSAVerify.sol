pragma solidity ^0.8.4;

import "./ModexpPrecompile.sol";
import "../../utils/BytesUtils.sol";

library RSAVerify {
    /**
     * @dev Recovers the input data from an RSA signature, returning the result in S.
     * @param N The RSA public modulus.
     * @param E The RSA public exponent.
     * @param S The signature to recover.
     * @return True if the recovery succeeded.
     */
    function rsarecover(
        bytes memory N,
        bytes memory E,
        bytes memory S
    ) internal view returns (bool, bytes memory) {
        return ModexpPrecompile.modexp(S, E, N);
    }
}
