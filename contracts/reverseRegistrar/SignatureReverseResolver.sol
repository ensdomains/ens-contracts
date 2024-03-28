pragma solidity >=0.8.4;

import "../registry/ENS.sol";
import "./ISignatureReverseResolver.sol";
import "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "../root/Controllable.sol";
import "../utils/LowLevelCallUtils.sol";

error InvalidSignature();
error SignatureOutOfDate();
error Unauthorised();

contract SignatureReverseResolver is ISignatureReverseResolver {
    using ECDSA for bytes32;
    using LowLevelCallUtils for address;
    mapping(bytes32 => uint256) public lastUpdated;
    mapping(uint64 => mapping(bytes32 => mapping(string => string))) versionable_texts;
    mapping(uint64 => mapping(bytes32 => string)) versionable_names;
    mapping(bytes32 => uint64) internal recordVersions;

    bytes32 public immutable parentNode;
    uint256 public immutable coinType;

    /*
     * @dev Constructor
     * @param parentNode The namespace to set.
     * @param _coinType The coinType converted from the chainId of the chain this contract is deployed to.
     */
    constructor(bytes32 _parentNode, uint256 _coinType) {
        parentNode = _parentNode;
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

    function isAuthorised(address addr) internal view virtual returns (bool) {
        revert("This function needs to be overridden");
    }

    function computeMessage(
        bytes32 hash,
        address addr,
        uint256 inceptionDate
    ) public view returns (bytes32) {
        // Follow ERC191 version 0 https://eips.ethereum.org/EIPS/eip-191
        return
            keccak256(
                abi.encodePacked(
                    bytes1(0x19),
                    bytes1(0),
                    address(this),
                    hash,
                    addr,
                    inceptionDate,
                    coinType
                )
            ).toEthSignedMessageHash();
    }

    function isAuthorisedWithSignature(
        bytes32 hash,
        address addr,
        uint256 inceptionDate,
        bytes memory signature
    ) internal view returns (bool) {
        bytes32 message = computeMessage(hash, addr, inceptionDate);
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
        emit TextChanged(node, key, key, value);
    }

    /**
     * Returns the text data associated with an ENS node and key.
     * @param node The ENS node to query.
     * @param key The text data key to query.
     * @return The associated text data.
     */
    function text(
        bytes32 node,
        string calldata key
    ) public view returns (string memory) {
        return versionable_texts[recordVersions[node]][node][key];
    }

    function _setName(
        bytes32 node,
        string memory newName,
        uint256 inceptionDate
    ) internal virtual {
        versionable_names[recordVersions[node]][node] = newName;
        _setLastUpdated(node, inceptionDate);
        emit NameChanged(node, newName);
    }

    /**
     * Returns the name associated with an ENS node, for reverse records.
     * Defined in EIP181.
     * @param node The ENS node to query.
     * @return The associated name.
     */
    function name(bytes32 node) public view returns (string memory) {
        return versionable_names[recordVersions[node]][node];
    }

    /**
     * Increments the record version associated with an ENS node.
     * May only be called by the owner of that node in the ENS registry.
     * @param addr The node to update.
     */
    function _clearRecords(address addr) internal {
        bytes32 labelHash = addr.sha3HexAddress();
        bytes32 reverseNode = keccak256(
            abi.encodePacked(parentNode, labelHash)
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

    /**
     * @dev Returns the node hash for a given account's reverse records.
     * @param addr The address to hash
     * @return The ENS node hash.
     */
    function node(address addr) public view returns (bytes32) {
        return keccak256(abi.encodePacked(parentNode, addr.sha3HexAddress()));
    }

    function _getNamehash(address addr) internal view returns (bytes32) {
        bytes32 labelHash = addr.sha3HexAddress();
        return keccak256(abi.encodePacked(parentNode, labelHash));
    }

    function _setLastUpdated(bytes32 node, uint256 inceptionDate) internal {
        lastUpdated[node] = inceptionDate;
    }

    function supportsInterface(
        bytes4 interfaceID
    ) public view virtual returns (bool) {
        return interfaceID == type(ISignatureReverseResolver).interfaceId;
    }
}
