// SPDX-License-Identifier: MIT

pragma solidity ^0.8.17;

import "@openzeppelin/contracts/interfaces/IERC1155.sol";
import "@openzeppelin/contracts/token/ERC1155/IERC1155Receiver.sol";
import "@openzeppelin/contracts/interfaces/IERC165.sol";
import "@openzeppelin/contracts/utils/Create2.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import {IMetadataService} from "../wrapper/IMetadataService.sol";
import {IERC1155MetadataURI} from "@openzeppelin/contracts/token/ERC1155/extensions/IERC1155MetadataURI.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import "./IController.sol";

contract L2Registry is Ownable, IERC1155, IERC1155MetadataURI {
    using Address for address;

    struct Record {
        string name;
        bytes data;
    }
    mapping(uint256 => Record) public tokens;
    mapping(address => mapping(address => bool)) approvals;
    mapping(address => uint256) tokenApprovalsNonce;
    mapping(address => mapping(uint256 => mapping(uint256 => mapping(address => bool)))) tokenApprovals;

    IMetadataService public metadataService;

    error TokenDoesNotExist(uint256 id);

    event NewController(uint256 id, address controller);

    constructor(bytes memory root, IMetadataService _metadataService) {
        tokens[0].data = root;
        metadataService = _metadataService;
    }

    /********************
     * Public functions *
     ********************/

    function uri(uint256 tokenId) public view returns (string memory) {
        return metadataService.uri(tokenId);
    }

    function setMetadataService(
        IMetadataService _metadataService
    ) public onlyOwner {
        metadataService = _metadataService;
    }

    function getData(uint256 id) external view returns (bytes memory) {
        return tokens[id].data;
    }

    function getName(uint256 id) external view returns (string memory) {
        return tokens[id].name;
    }

    function safeTransferFrom(
        address from,
        address to,
        uint256 id,
        uint256 value,
        bytes calldata data
    ) external {
        _safeTransferFrom(from, to, id, value, data);
        emit TransferSingle(msg.sender, from, to, id, value);

        _doSafeTransferAcceptanceCheck(msg.sender, from, to, id, value, data);
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

        _doSafeBatchTransferAcceptanceCheck(
            msg.sender,
            from,
            to,
            ids,
            values,
            data
        );
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
        address _owner = _getController(tokens[id].data).ownerOfWithData(
            tokens[id].data
        );
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
        bytes memory tokenData = tokens[id].data;
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
            bytes memory tokenData = tokens[i].data;
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
        address _owner = _getController(tokens[id].data).ownerOfWithData(
            tokens[id].data
        );
        return
            tokenApprovals[_owner][tokenApprovalsNonce[_owner]][id][delegate];
    }

    function clearAllApprovedForIds(address owner) external {
        // make sure the caller is the owner or an approved operator.
        require(
            msg.sender == owner || isApprovedForAll(owner, msg.sender),
            "L2Registry: caller is not owner or approved operator"
        );
        tokenApprovalsNonce[owner]++;
    }

    function getAuthorization(
        uint256 id,
        address delegate
    ) public view returns (bool /*authorized*/) {
        address owner = _getController(tokens[id].data).ownerOfWithData(
            tokens[id].data
        );
        return
            approvals[owner][delegate] ||
            tokenApprovals[owner][tokenApprovalsNonce[owner]][id][delegate];
    }

    function getAuthorization(
        uint256 id,
        address owner,
        address delegate
    ) public view returns (bool /*authorized*/) {
        return
            approvals[owner][delegate] ||
            tokenApprovals[owner][tokenApprovalsNonce[owner]][id][delegate];
    }

    function supportsInterface(
        bytes4 interfaceId
    ) external pure returns (bool) {
        return
            interfaceId == type(IERC1155).interfaceId ||
            interfaceId == type(IERC1155MetadataURI).interfaceId ||
            interfaceId == type(IERC165).interfaceId;
    }

    function resolver(uint256 id) external view returns (address /*resolver*/) {
        bytes memory tokenData = tokens[id].data;
        IController _controller = _getController(tokenData);
        return _controller.resolverFor(tokenData);
    }

    function controller(
        uint256 id
    ) external view returns (IController /*controller*/) {
        return _getController(tokens[id].data);
    }

    /*****************************
     * Controller-only functions *
     *****************************/

    function setNode(uint256 id, bytes memory data) external {
        // Fetch the current controller for this node
        IController oldController = _getController(tokens[id].data);
        // Only the controller may call this function
        require(address(oldController) == msg.sender);

        // Fetch the new controller and emit `NewController` if needed.
        IController newController = _getController(data);
        if (oldController != newController) {
            emit NewController(id, address(newController));
        }

        // Update the data for this node.
        tokens[id].data = data;
    }

    function setSubnode(
        uint256 id,
        uint256 label,
        bytes memory subnodeData,
        address operator,
        address to
    ) external {
        // Fetch the token data and controller for the current node
        bytes memory tokenData = tokens[id].data;
        IController _controller = _getController(tokenData);
        // Only the controller of the node may call this function
        require(address(_controller) == msg.sender);

        // Compute the subnode ID, and fetch the current data for it (if any)
        uint256 subnode = uint256(keccak256(abi.encodePacked(id, label)));
        bytes memory oldSubnodeData = tokens[subnode].data;
        IController oldSubnodeController = _getController(oldSubnodeData);
        address oldOwner = oldSubnodeData.length < 20
            ? address(0)
            : oldSubnodeController.ownerOfWithData(oldSubnodeData);

        // Get the address of the new controller
        IController newSubnodeController = _getController(subnodeData);
        if (newSubnodeController != oldSubnodeController) {
            emit NewController(subnode, address(newSubnodeController));
        }

        tokens[subnode].data = subnodeData;

        // Fetch the to address, if not supplied, for the TransferSingle event.
        if (to == address(0) && subnodeData.length >= 20) {
            to = _getController(subnodeData).ownerOfWithData(subnodeData);
        }

        emit TransferSingle(operator, oldOwner, to, subnode, 1);

        _doSafeTransferAcceptanceCheck(
            operator,
            oldOwner,
            to,
            subnode,
            1,
            bytes("")
        );
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
            addr := mload(add(data, 20))
        }
    }

    function _safeTransferFrom(
        address from,
        address to,
        uint256 id,
        uint256 value,
        bytes calldata data
    ) internal {
        bytes memory tokenData = tokens[id].data;
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

        tokens[id].data = newTokenData;
    }

    function _doSafeTransferAcceptanceCheck(
        address operator,
        address from,
        address to,
        uint256 id,
        uint256 amount,
        bytes memory data
    ) private {
        if (to.isContract()) {
            try
                IERC1155Receiver(to).onERC1155Received(
                    operator,
                    from,
                    id,
                    amount,
                    data
                )
            returns (bytes4 response) {
                if (
                    response != IERC1155Receiver(to).onERC1155Received.selector
                ) {
                    revert("ERC1155: ERC1155Receiver rejected tokens");
                }
            } catch Error(string memory reason) {
                revert(reason);
            } catch {
                revert("ERC1155: transfer to non ERC1155Receiver implementer");
            }
        }
    }

    function _doSafeBatchTransferAcceptanceCheck(
        address operator,
        address from,
        address to,
        uint256[] memory ids,
        uint256[] memory amounts,
        bytes memory data
    ) private {
        if (to.isContract()) {
            try
                IERC1155Receiver(to).onERC1155BatchReceived(
                    operator,
                    from,
                    ids,
                    amounts,
                    data
                )
            returns (bytes4 response) {
                if (
                    response !=
                    IERC1155Receiver(to).onERC1155BatchReceived.selector
                ) {
                    revert("ERC1155: ERC1155Receiver rejected tokens");
                }
            } catch Error(string memory reason) {
                revert(reason);
            } catch {
                revert("ERC1155: transfer to non ERC1155Receiver implementer");
            }
        }
    }
}
