pragma solidity >=0.6.0 <0.8.0;
pragma experimental ABIEncoderV2;

import "hardhat/console.sol";
import "./profiles/AddrResolver.sol";
import "./profiles/ContentHashResolver.sol";
import "../interfaces/ENS.sol";
import "../interfaces/INFTFuseWrapper.sol";

/**
 * A simple resolver anyone can use; only allows the owner of a node to set its
 * address.
 */
contract PublicResolver is AddrResolver, ContentHashResolver {
    ENS ens;
    INFTFuseWrapper wrapper;

    /**
     * A mapping of authorisations. An address that is authorised for a name
     * may make any changes to the name that the owner could, but may not update
     * the set of authorisations.
     * (node, owner, caller) => isAuthorised
     */
    mapping(bytes32 => mapping(address => mapping(address => bool)))
        public authorisations;

    event AuthorisationChanged(
        bytes32 indexed node,
        address indexed owner,
        address indexed target,
        bool isAuthorised
    );

    constructor(ENS _ens, INFTFuseWrapper _wrapper) public {
        ens = _ens;
        wrapper = _wrapper;
    }

    /**
     * @dev Sets or clears an authorisation.
     * Authorisations are specific to the caller. Any account can set an authorisation
     * for any name, but the authorisation that is checked will be that of the
     * current owner of a name. Thus, transferring a name effectively clears any
     * existing authorisations, and new authorisations can be set in advance of
     * an ownership transfer if desired.
     *
     * @param node The name to change the authorisation on.
     * @param target The address that is to be authorised or deauthorised.
     * @param isAuthorised True if the address should be authorised, or false if it should be deauthorised.
     */
    function setAuthorisation(
        bytes32 node,
        address target,
        bool isAuthorised
    ) external {
        authorisations[node][msg.sender][target] = isAuthorised;
        emit AuthorisationChanged(node, msg.sender, target, isAuthorised);
    }

    function isAuthorised(bytes32 node) internal view override returns (bool) {
        address owner = ens.owner(node);

        // if owner is wrapper
        if (owner == address(wrapper)) {
            // TODO check owner is a contract
            console.log("permissions");

            //Wrapper assumes ERC721 ownership interface
            return
                owner == msg.sender || authorisations[node][owner][msg.sender];
            //TODO: add this back in
            // || wrapper.ownerOf(uint256(node)) == msg.sender ||
            // wrapper.isApprovedForAll(owner, msg.sender);
        }

        return owner == msg.sender || authorisations[node][owner][msg.sender];
    }

    function readBytes32(bytes memory self, uint256 idx)
        internal
        pure
        returns (bytes32 ret)
    {
        require(idx + 32 <= self.length);
        assembly {
            ret := mload(add(add(self, 32), idx))
        }
    }

    function safeMulticall(bytes32 node, bytes[] calldata data)
        public
        returns (bytes[] memory results)
    {
        results = new bytes[](data.length);
        for (uint256 i = 0; i < data.length; i++) {
            require(
                node == 0 || readBytes32(data[i], 4) == node,
                "invalid node for multicall"
            );
            (bool success, bytes memory result) =
                address(this).delegatecall(data[i]);
            require(success);
            results[i] = result;
        }
        return results;
    }

    function multicall(bytes[] calldata data)
        external
        returns (bytes[] memory results)
    {
        return safeMulticall(0, data);
    }

    function supportsInterface(bytes4 interfaceID)
        public
        pure
        override(AddrResolver, ContentHashResolver)
        returns (bool)
    {
        return super.supportsInterface(interfaceID);
    }
}

// wrapper aware
