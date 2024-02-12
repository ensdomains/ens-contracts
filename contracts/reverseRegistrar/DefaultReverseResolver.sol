pragma solidity >=0.8.4;

import "./IDefaultReverseResolver.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/introspection/ERC165.sol";
import "../resolvers/profiles/ITextResolver.sol";
import "../resolvers/profiles/INameResolver.sol";
import "../../contracts/resolvers/profiles/IExtendedResolver.sol";
import "../wrapper/BytesUtils.sol";
import "../utils/HexUtils.sol";
import "../utils/LowLevelCallUtils.sol";

// name(bytes32 node)
// name(address)
// resolve(name, )
contract DefaultReverseResolver is
    Ownable,
    IExtendedResolver,
    IDefaultReverseResolver,
    ERC165
{
    using ECDSA for bytes32;
    using BytesUtils for bytes;
    using HexUtils for bytes32;
    mapping(bytes32 => uint256) public lastUpdated;
    mapping(uint64 => mapping(bytes32 => mapping(string => string))) versionable_texts;
    mapping(uint64 => mapping(bytes32 => string)) versionable_names;
    mapping(bytes32 => uint64) internal recordVersions;
    event VersionChanged(bytes32 indexed node, uint64 newVersion);
    event ReverseClaimed(address indexed addr, bytes32 indexed node);
    // The namehash of 'default.reverse'
    bytes32 private constant DEFAULT_REVERSE_NODE =
        0x53a2e7cce84726721578c676b4798972d354dd7c62c832415371716693edd312;
    // This is the hex encoding of the string 'abcdefghijklmnopqrstuvwxyz'
    // It is used as a constant to lookup the characters of the hex address
    bytes32 constant lookup =
        0x3031323334353637383961626364656600000000000000000000000000000000;

    error InvalidSignature();
    error SignatureOutOfDate();
    error Unauthorised();

    modifier authorised(address addr) {
        isAuthorised(addr);
        _;
    }

    function isAuthorised(address addr) internal view returns (bool) {
        // if (addr != msg.sender && !ownsContract(addr, msg.sender)) {
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
        (bytes32 labelhash, uint256 offset) = encodedname.readLabel(0);
        (address addr, ) = HexUtils.hexToAddress(
            abi.encodePacked(labelhash),
            0,
            offset
        );
        if (selector == INameResolver.name.selector) {
            return bytes(name(addr));
        }
        if (selector == ITextResolver.text.selector) {
            (, string memory key) = abi.decode(data[4:], (bytes32, string));
            return bytes(text(addr, key));
        }
    }

    function setNameForAddrWithSignature(
        address addr,
        string memory name,
        uint256 inceptionDate,
        bytes memory signature
    )
        public
        override
        authorisedSignature(
            keccak256(
                abi.encodePacked(
                    IDefaultReverseResolver
                        .setNameForAddrWithSignature
                        .selector,
                    name
                )
            ),
            addr,
            inceptionDate,
            signature
        )
        returns (bytes32)
    {
        bytes32 node = _getNamehash(addr);
        _setName(node, name, inceptionDate);
        emit ReverseClaimed(addr, node);
        return node;
    }

    function setTextForAddrWithSignature(
        address addr,
        string calldata key,
        string calldata value,
        uint256 inceptionDate,
        bytes memory signature
    )
        public
        override
        authorisedSignature(
            keccak256(
                abi.encodePacked(
                    IDefaultReverseResolver
                        .setTextForAddrWithSignature
                        .selector,
                    key,
                    value
                )
            ),
            addr,
            inceptionDate,
            signature
        )
        returns (bytes32)
    {
        bytes32 node = _getNamehash(addr);
        _setText(node, key, value, inceptionDate);
        return node;
    }

    /**
     * Sets the name associated with an ENS node, for reverse records.
     * May only be called by the owner of that node in the ENS registry.
     * @param node The node to update.
     * @param newName name record
     */
    function _setName(
        bytes32 node,
        string memory newName,
        uint256 inceptionDate
    ) internal virtual {
        versionable_names[recordVersions[node]][node] = newName;
        _setLastUpdated(node, inceptionDate);
        emit NameChanged(node, newName);
    }

    function _setText(
        bytes32 node,
        string calldata key,
        string calldata value,
        uint256 inceptionDate
    ) internal {
        versionable_texts[recordVersions[node]][node][key] = value;
        _setLastUpdated(node, inceptionDate);
        emit TextChanged(node, key, key, value);
    }

    function _getNamehash(address addr) internal view returns (bytes32) {
        bytes32 labelHash = LowLevelCallUtils.sha3HexAddress(addr);
        return keccak256(abi.encodePacked(DEFAULT_REVERSE_NODE, labelHash));
    }

    function _setLastUpdated(bytes32 node, uint256 inceptionDate) internal {
        lastUpdated[node] = inceptionDate;
    }

    modifier authorisedSignature(
        bytes32 hash,
        address addr,
        uint256 inceptionDate,
        bytes memory signature
    ) {
        isAuthorisedWithSignature(hash, addr, inceptionDate, signature);
        _;
    }

    function isAuthorisedWithSignature(
        bytes32 hash,
        address addr,
        uint256 inceptionDate,
        bytes memory signature
    ) internal view returns (bool) {
        bytes32 message = keccak256(
            // abi.encodePacked(hash, addr, inceptionDate, coinType)
            abi.encodePacked(hash, addr, inceptionDate)
        ).toEthSignedMessageHash();
        bytes32 node = _getNamehash(addr);

        if (!SignatureChecker.isValidSignatureNow(addr, message, signature)) {
            revert InvalidSignature();
        }

        if (
            inceptionDate <= lastUpdated[node] || // must be newer than current record
            inceptionDate / 1000 >= block.timestamp // must be in the past
        ) {
            revert SignatureOutOfDate();
        }
    }

    function clearRecordsWithSignature(
        address addr,
        uint256 inceptionDate,
        bytes memory signature
    )
        public
        virtual
        authorisedSignature(
            keccak256(
                abi.encodePacked(
                    IDefaultReverseResolver.clearRecordsWithSignature.selector
                )
            ),
            addr,
            inceptionDate,
            signature
        )
    {
        bytes32 labelHash = LowLevelCallUtils.sha3HexAddress(addr);
        bytes32 reverseNode = keccak256(
            abi.encodePacked(DEFAULT_REVERSE_NODE, labelHash)
        );
        recordVersions[reverseNode]++;
        emit VersionChanged(reverseNode, recordVersions[reverseNode]);
    }

    function supportsInterface(
        bytes4 interfaceID
    ) public view override returns (bool) {
        return interfaceID == type(IDefaultReverseResolver).interfaceId;
    }
}
