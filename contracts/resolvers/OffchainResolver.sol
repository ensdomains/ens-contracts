// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "./SupportsInterface.sol";
import "./IExtendedResolver.sol";

interface IResolverService {
    function resolve(bytes calldata name, bytes calldata data) external view returns(bytes memory result, uint64 expires, bytes memory sig);
}

/**
 * Implements an ENS resolver that directs all queries to a CCIP read gateway.
 * Callers must implement EIP 3668 and ENSIP 10.
 */
contract OffchainResolver is IExtendedResolver, SupportsInterface {
    string public url;
    mapping(address=>bool) public signers;

    event NewSigners(address[] signers);
    error OffchainLookup(address sender, string[] urls, bytes callData, bytes4 callbackFunction, bytes extraData);

    constructor(string memory _url, address[] memory _signers) {
        url = _url;
        for(uint i = 0; i < _signers.length; i++) {
            signers[_signers[i]] = true;
        }
        emit NewSigners(_signers);
    }

    /**
     * @dev Generates a hash for signing/verifying.
     * @param target: The address the signature is for.
     * @param request: The original request that was sent.
     * @param result: The `result` field of the response (not including the signature part).
     */
    function makeSignatureHash(address target, uint64 expires, bytes memory request, bytes memory result) public pure returns(bytes32) {
        return keccak256(abi.encodePacked(hex"1900", target, expires, keccak256(request), keccak256(result)));
    }

    /**
     * @dev Verifies a signed message returned from a callback.
     * @param request: The original request that was sent.
     * @param response: An ABI encoded tuple of `(bytes result, uint64 expires, bytes sig)`, where `result` is the data to return
     *        to the caller, and `sig` is the (r,s,v) encoded message signature.
     * @return The `result` decoded from `response`, or a revert if the signature does not verify correctly.
     */
    function verify(bytes calldata request, bytes calldata response) public view returns(bytes memory) {
        (bytes memory result, uint64 expires, bytes memory sig) = abi.decode(response, (bytes, uint64, bytes));
        require(
            signers[ECDSA.recover(makeSignatureHash(address(this), expires, request, result), sig)], 
            "SignatureVerifier: Invalid sigature");
        require(
            expires >= block.timestamp,
            "SignatureVerifier: Signature expired");
        return result;
    }

    /**
     * Resolves a name, as specified by ENSIP 10.
     * @param name The DNS-encoded name to resolve.
     * @param data The ABI encoded data for the underlying resolution function (Eg, addr(bytes32), text(bytes32,string), etc).
     * @return The return data, ABI encoded identically to the underlying function.
     */
    function resolve(bytes calldata name, bytes calldata data) external override view returns(bytes memory) {
        bytes memory callData = abi.encodeWithSelector(IResolverService.resolve.selector, name, data);
        string[] memory urls = new string[](1);
        urls[0] = url;
        revert OffchainLookup(
            address(this),
            urls,
            callData,
            OffchainResolver.resolveWithProof.selector,
            callData
        );
    }

    /**
     * Callback used by CCIP read compatible clients to verify and parse the response.
     */
    function resolveWithProof(bytes calldata response, bytes calldata extraData) external view returns(bytes memory) {
        bytes memory result = verify(extraData, response);
        return result;
    }

    function supportsInterface(bytes4 interfaceID) public pure override returns(bool) {
        return interfaceID == type(IExtendedResolver).interfaceId || super.supportsInterface(interfaceID);
    }
}
