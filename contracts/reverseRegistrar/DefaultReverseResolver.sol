pragma solidity >=0.8.4;

import "./IDefaultReverseResolver.sol";
import "./SignatureReverseResolver.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/introspection/ERC165.sol";
import "../wrapper/BytesUtils.sol";

/**
 * A fallback reverser resolver to resolve when L2 reverse resolver has no names set.
 * The contract will be set under "default.reverse" namespace
 * It can only be set by EOA as contract accounts are chain dependent.
 */
contract DefaultReverseResolver is
    Ownable,
    IDefaultReverseResolver,
    ERC165,
    SignatureReverseResolver
{
    using ECDSA for bytes32;
    using BytesUtils for bytes;
    // The namehash of 'default.reverse'
    bytes32 private constant DEFAULT_REVERSE_NODE =
        0x53a2e7cce84726721578c676b4798972d354dd7c62c832415371716693edd312;

    /**
     * @dev Constructor
     */
    constructor() SignatureReverseResolver(DEFAULT_REVERSE_NODE, 0) {}

    function isAuthorised(address addr) internal view override returns (bool) {
        if (addr != msg.sender) {
            revert Unauthorised();
        }
    }

    /*
     * Returns the name associated with an address, for reverse records.
     * This function is non ENSIP standard
     * @param address The ENS address to query.
     * @return The associated name.
     */
    function name(address addr) public view returns (string memory) {
        bytes32 node = _getNamehash(addr);
        return versionable_names[recordVersions[node]][node];
    }

    /*
     * Returns the text data associated with an address and key.
     * @param address The ENS address to query.
     * @param key The text data key to query.
     * @return The associated text data.
     */
    function text(
        address addr,
        string memory key
    ) public view returns (string memory) {
        bytes32 node = _getNamehash(addr);
        return versionable_texts[recordVersions[node]][node][key];
    }

    function supportsInterface(
        bytes4 interfaceID
    ) public view override(ERC165, SignatureReverseResolver) returns (bool) {
        return
            interfaceID == type(IDefaultReverseResolver).interfaceId ||
            super.supportsInterface(interfaceID);
    }
}
