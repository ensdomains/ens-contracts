pragma solidity >=0.8.4;

import "./IDefaultReverseResolver.sol";
import "./SignatureReverseResolver.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/introspection/ERC165.sol";
import "../../contracts/resolvers/profiles/IExtendedResolver.sol";
import "../wrapper/BytesUtils.sol";

contract DefaultReverseResolver is
    Ownable,
    IExtendedResolver,
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

    function name(address addr) public view returns (string memory) {
        bytes32 node = _getNamehash(addr);
        return versionable_names[recordVersions[node]][node];
    }

    function text(
        address addr,
        string memory key
    ) public view returns (string memory) {
        bytes32 node = _getNamehash(addr);
        return versionable_texts[recordVersions[node]][node][key];
    }

    function resolve(
        bytes memory encodedname,
        bytes calldata data
    ) external view returns (bytes memory result) {
        bytes4 selector = bytes4(data);
        // readLabel wasn't decoding labelhash properly hence
        // (bytes32 labelhash, uint256 offset) = encodedname.readLabel(0);
        // (address addr, ) = HexUtils.hexToAddress(
        //     abi.encodePacked(labelhash),
        //     0,
        //     labelhash.length
        // );
        if (selector == IDefaultReverseResolver.name.selector) {
            address addr = abi.decode(data[4:], (address));
            string memory n = name(addr);
            return bytes(n);
        }
        if (selector == IDefaultReverseResolver.text.selector) {
            (address addr, string memory key) = abi.decode(
                data[4:],
                (address, string)
            );
            return bytes(text(addr, key));
        }
    }

    function supportsInterface(
        bytes4 interfaceID
    ) public view override(ERC165, SignatureReverseResolver) returns (bool) {
        return
            interfaceID == type(IDefaultReverseResolver).interfaceId ||
            super.supportsInterface(interfaceID);
    }
}
