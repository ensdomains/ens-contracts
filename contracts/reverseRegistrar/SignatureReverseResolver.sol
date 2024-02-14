pragma solidity >=0.8.4;

import "../registry/ENS.sol";
import "./ISignatureReverseResolver.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "../root/Controllable.sol";
import "../utils/LowLevelCallUtils.sol";

error InvalidSignature();
error SignatureOutOfDate();
error Unauthorised();

// @note Inception date
// The inception date is in milliseconds, and so will be divided by 1000
// when comparing to block.timestamp. This means that the date will be
// rounded down to the nearest second.

contract SignatureReverseResolver is Ownable, ISignatureReverseResolver {
    using ECDSA for bytes32;
    mapping(bytes32 => uint256) public lastUpdated;
    mapping(uint64 => mapping(bytes32 => mapping(string => string))) versionable_texts;
    mapping(uint64 => mapping(bytes32 => string)) versionable_names;
    mapping(bytes32 => uint64) internal recordVersions;
    event VersionChanged(bytes32 indexed node, uint64 newVersion);
    event ReverseClaimed(address indexed addr, bytes32 indexed node);

    bytes32 public immutable ParentNode;
    uint256 public immutable coinType;

    /**
     * @dev Constructor
     */
    constructor(bytes32 _ParentNode, uint256 _coinType) {
        ParentNode = _ParentNode;
        coinType = _coinType;
    }

    modifier authorised(address addr) {
        isAuthorised(addr);
        _;
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

    function getLastUpdated(
        bytes32 node
    ) internal view virtual returns (uint256) {
        return lastUpdated[node];
    }

    function isAuthorised(address addr) internal view virtual returns (bool) {}

    function isAuthorisedWithSignature(
        bytes32 hash,
        address addr,
        uint256 inceptionDate,
        bytes memory signature
    ) internal view returns (bool) {
        bytes32 message = keccak256(
            abi.encodePacked(hash, addr, inceptionDate, coinType)
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

    /**
     * @dev Sets the name for an addr using a signature that can be verified with ERC1271.
     * @param addr The reverse record to set
     * @param name The name of the reverse record
     * @param inceptionDate Date from when this signature is valid from
     * @param signature The resolver of the reverse node
     * @return The ENS node hash of the reverse record.
     */
    function setNameForAddrWithSignature(
        address addr,
        string memory name,
        uint256 inceptionDate,
        bytes memory signature
    )
        public
        authorisedSignature(
            keccak256(
                abi.encodePacked(
                    ISignatureReverseResolver
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

    /**
     * @dev Sets the name for an addr using a signature that can be verified with ERC1271.
     * @param addr The reverse record to set
     * @param key The key of the text record
     * @param value The value of the text record
     * @param inceptionDate Date from when this signature is valid from
     * @param signature The resolver of the reverse node
     * @return The ENS node hash of the reverse record.
     */
    function setTextForAddrWithSignature(
        address addr,
        string calldata key,
        string calldata value,
        uint256 inceptionDate,
        bytes memory signature
    )
        public
        authorisedSignature(
            keccak256(
                abi.encodePacked(
                    ISignatureReverseResolver
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

    function _setText(
        bytes32 node,
        string calldata key,
        string calldata value,
        uint256 inceptionDate
    ) internal {
        versionable_texts[recordVersions[node]][node][key] = value;
        _setLastUpdated(node, inceptionDate);
        // emit TextChanged(node, key, key, value);
    }

    /**
     * Returns the text data associated with an ENS node and key.
     * @param node The ENS node to query.
     * @param key The text data key to query.
     * @return The associated text data.
     */
    function _text(
        bytes32 node,
        string calldata key
    ) internal view returns (string memory) {
        return versionable_texts[recordVersions[node]][node][key];
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
        // emit NameChanged(node, newName);
    }

    function _name(bytes32 node) internal view returns (string memory) {
        return versionable_names[recordVersions[node]][node];
    }

    /**
     * Increments the record version associated with an ENS node.
     * May only be called by the owner of that node in the ENS registry.
     * @param addr The node to update.
     */
    function _clearRecords(address addr) internal {
        bytes32 labelHash = LowLevelCallUtils.sha3HexAddress(addr);
        bytes32 reverseNode = keccak256(
            abi.encodePacked(ParentNode, labelHash)
        );
        recordVersions[reverseNode]++;
        emit VersionChanged(reverseNode, recordVersions[reverseNode]);
    }

    /**
     * Increments the record version associated with an ENS node.
     * May only be called by the owner of that node in the ENS registry.
     * @param addr The node to update.
     * @param signature A signature proving ownership of the node.
     */
    function clearRecordsWithSignature(
        address addr,
        uint256 inceptionDate,
        bytes memory signature
    )
        public
        authorisedSignature(
            keccak256(
                abi.encodePacked(
                    ISignatureReverseResolver.clearRecordsWithSignature.selector
                )
            ),
            addr,
            inceptionDate,
            signature
        )
    {
        _clearRecords(addr);
    }

    function _getNamehash(address addr) internal view returns (bytes32) {
        bytes32 labelHash = LowLevelCallUtils.sha3HexAddress(addr);
        return keccak256(abi.encodePacked(ParentNode, labelHash));
    }

    function _setLastUpdated(bytes32 node, uint256 inceptionDate) internal {
        lastUpdated[node] = inceptionDate;
    }

    function supportsInterface(
        bytes4 interfaceID
    ) public view virtual returns (bool) {
        return interfaceID == type(ISignatureReverseResolver).interfaceId;
        // super.supportsInterface(interfaceID);
    }
}
