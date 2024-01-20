// SPDX-License-Identifier: MIT

pragma solidity ^0.8.17;
import "@openzeppelin/contracts/interfaces/IERC1155.sol";
import "@openzeppelin/contracts/interfaces/IERC165.sol";
import "@openzeppelin/contracts/utils/Create2.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "./IController.sol";

contract L2Registry is IERC1155 {
    mapping(uint256 => bytes) public tokens;
    mapping(address => mapping(address => bool)) approvals;
    mapping(address => uint256) tokenApprovalsNonce;
    mapping(address => mapping(uint256 => mapping(uint256 => mapping(address => bool)))) tokenApprovals;

    error TokenDoesNotExist(uint256 id);

    event NewController(uint256 id, address controller);

    constructor(bytes memory root) {
        tokens[0] = root;
    }

    /********************
     * Public functions *
     ********************/

    function safeTransferFrom(
        address from,
        address to,
        uint256 id,
        uint256 value,
        bytes calldata data
    ) external {
        _safeTransferFrom(from, to, id, value, data);
        emit TransferSingle(msg.sender, from, to, id, value);
    }

    function safeBatchTransferFrom(
        address from,
        address to,
        uint256[] calldata ids,
        uint256[] calldata values,
        bytes calldata data
    ) external {
        require(ids.length == values.length);
        for (uint256 i = 0; i < ids.length; i++) {
            _safeTransferFrom(from, to, ids[i], values[i], data);
        }
        emit TransferBatch(msg.sender, from, to, ids, values);
    }

    function setApprovalForAll(address operator, bool approved) external {
        approvals[msg.sender][operator] = approved;
        emit ApprovalForAll(msg.sender, operator, approved);
    }

    // set approval for id
    function setApprovalForId(
        address delegate,
        uint256 id,
        bool approved
    ) external {
        // get the owner of the token
        address _owner = _getController(tokens[id]).ownerOf(tokens[id]);
        // make sure the caller is the owner or an approved operator.
        require(
            msg.sender == _owner || isApprovedForAll(_owner, msg.sender),
            "L2Registry: caller is not owner or approved operator"
        );

        tokenApprovals[_owner][tokenApprovalsNonce[_owner]][id][
            delegate
        ] = approved;
    }

    /*************************
     * Public view functions *
     *************************/
    function balanceOf(
        address owner,
        uint256 id
    ) external view returns (uint256) {
        bytes memory tokenData = tokens[id];
        IController _controller = _getController(tokenData);
        if (address(_controller) == address(0)) {
            revert TokenDoesNotExist(id);
        }
        return _controller.balanceOf(tokenData, owner, id);
    }

    function balanceOfBatch(
        address[] calldata owners,
        uint256[] calldata ids
    ) external view returns (uint256[] memory balances) {
        require(owners.length == ids.length);
        balances = new uint256[](owners.length);
        for (uint256 i = 0; i < owners.length; i++) {
            bytes memory tokenData = tokens[i];
            balances[i] = _getController(tokenData).balanceOf(
                tokenData,
                owners[i],
                ids[i]
            );
        }
    }

    function isApprovedForAll(
        address owner,
        address operator
    ) public view returns (bool) {
        return approvals[owner][operator];
    }

    function isApprovedForId(
        uint256 id,
        address delegate
    ) public view returns (bool) {
        // get the owner
        address _owner = _getController(tokens[id]).ownerOf(tokens[id]);
        return
            tokenApprovals[_owner][tokenApprovalsNonce[_owner]][id][delegate];
    }

    function clearAllApprovedForIds(address owner) external {
        // make sure the caller is the owner or an approved operator.
        require(
            msg.sender == owner || approvals[owner][msg.sender],
            "L2Registry: caller is not owner or approved operator"
        );
        tokenApprovalsNonce[owner]++;
    }

    function getAuthorization(
        uint256 id,
        address delegate
    ) public view returns (bool authorized) {
        address owner = _getController(tokens[id]).ownerOf(tokens[id]);
        authorized =
            approvals[owner][delegate] ||
            tokenApprovals[owner][tokenApprovalsNonce[owner]][id][delegate];
    }

    function supportsInterface(
        bytes4 interfaceId
    ) external pure returns (bool) {
        return
            interfaceId == type(IERC1155).interfaceId ||
            interfaceId == type(IERC165).interfaceId;
    }

    function resolver(uint256 id) external view returns (address) {
        bytes memory tokenData = tokens[id];
        IController _controller = _getController(tokenData);
        return _controller.resolverFor(tokenData);
    }

    function controller(uint256 id) external view returns (IController) {
        return _getController(tokens[id]);
    }

    /*****************************
     * Controller-only functions *
     *****************************/

    function setNode(uint256 id, bytes memory data) external {
        // Fetch the current controller for this node
        IController oldController = _getController(tokens[id]);
        // Only the controller may call this function
        require(address(oldController) == msg.sender);

        // Fetch the new controller and emit `NewController` if needed.
        IController newController = _getController(data);
        if (oldController != newController) {
            emit NewController(id, address(newController));
        }

        // Update the data for this node.
        tokens[id] = data;
    }

    function setSubnode(
        uint256 id,
        uint256 label,
        bytes memory subnodeData,
        address operator,
        address to
    ) external {
        // Fetch the token data and controller for the current node
        bytes memory tokenData = tokens[id];
        IController _controller = _getController(tokenData);
        // Only the controller of the node may call this function
        require(address(_controller) == msg.sender);

        // Compute the subnode ID, and fetch the current data for it (if any)
        uint256 subnode = uint256(keccak256(abi.encodePacked(id, label)));
        bytes memory oldSubnodeData = tokens[subnode];
        IController oldSubnodeController = _getController(oldSubnodeData);
        address oldOwner = oldSubnodeData.length < 20
            ? address(0)
            : oldSubnodeController.ownerOf(oldSubnodeData);

        // Get the address of the new controller
        IController newSubnodeController = _getController(subnodeData);
        if (newSubnodeController != oldSubnodeController) {
            emit NewController(subnode, address(newSubnodeController));
        }

        tokens[subnode] = subnodeData;

        // Fetch the to address, if not supplied, for the TransferSingle event.
        if (to == address(0) && subnodeData.length >= 20) {
            to = _getController(subnodeData).ownerOf(subnodeData);
        }
        emit TransferSingle(operator, oldOwner, to, subnode, 1);
    }

    /**********************
     * Internal functions *
     **********************/

    function _getController(
        bytes memory data
    ) internal pure returns (IController addr) {
        if (data.length < 20) {
            return IController(address(0));
        }
        assembly {
            addr := shr(96, mload(add(data, 32)))
        }
    }

    function _safeTransferFrom(
        address from,
        address to,
        uint256 id,
        uint256 value,
        bytes calldata data
    ) internal {
        bytes memory tokenData = tokens[id];
        IController oldController = _getController(tokenData);
        if (address(oldController) == address(0)) {
            revert TokenDoesNotExist(id);
        }
        bool isApproved = approvals[from][msg.sender] ||
            tokenApprovals[from][tokenApprovalsNonce[from]][id][msg.sender];

        bytes memory newTokenData = oldController.safeTransferFrom(
            tokenData,
            msg.sender,
            from,
            to,
            id,
            value,
            data,
            isApproved
        );

        IController newController = _getController(newTokenData);
        if (newController != oldController) {
            emit NewController(id, address(newController));
        }
        tokens[id] = newTokenData;
    }
}
