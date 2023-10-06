// SPDX-License-Identifier: MIT
pragma solidity >=0.8.4;

import "@openzeppelin/contracts/utils/introspection/ERC165.sol";
import "../../resolvers/profiles/IVersionableResolver.sol";

abstract contract L2ReverseResolverBase is ERC165 {
    mapping(bytes32 => uint64) internal recordVersions;
    event VersionChanged(bytes32 indexed node, uint64 newVersion);
    bytes32 public immutable L2_REVERSE_NODE;

    bytes32 constant lookup =
        0x3031323334353637383961626364656600000000000000000000000000000000;

    function isAuthorised(address addr) internal view virtual returns (bool);

    constructor(bytes32 l2ReverseNode) {
        L2_REVERSE_NODE = l2ReverseNode;
    }

    modifier authorised(address addr) virtual {
        require(isAuthorised(addr));
        _;
    }

    /**
     * Increments the record version associated with an ENS node.
     * May only be called by the owner of that node in the ENS registry.
     * @param addr The node to update.
     */
    function clearRecords(address addr) public virtual authorised(addr) {
        bytes32 labelHash = sha3HexAddress(addr);
        bytes32 reverseNode = keccak256(
            abi.encodePacked(L2_REVERSE_NODE, labelHash)
        );
        recordVersions[reverseNode]++;
        emit VersionChanged(reverseNode, recordVersions[reverseNode]);
    }

    function supportsInterface(
        bytes4 interfaceID
    ) public view virtual override returns (bool) {
        return
            interfaceID == type(IVersionableResolver).interfaceId ||
            super.supportsInterface(interfaceID);
    }

    /**
     * @dev An optimised function to compute the sha3 of the lower-case
     *      hexadecimal representation of an Ethereum address.
     * @param addr The address to hash
     * @return ret The SHA3 hash of the lower-case hexadecimal encoding of the
     *         input address.
     */
    function sha3HexAddress(address addr) internal pure returns (bytes32 ret) {
        assembly {
            for {
                let i := 40
            } gt(i, 0) {

            } {
                i := sub(i, 1)
                mstore8(i, byte(and(addr, 0xf), lookup))
                addr := div(addr, 0x10)
                i := sub(i, 1)
                mstore8(i, byte(and(addr, 0xf), lookup))
                addr := div(addr, 0x10)
            }

            ret := keccak256(0, 40)
        }
    }
}
