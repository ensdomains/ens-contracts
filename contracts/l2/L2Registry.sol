// SPDX-License-Identifier: MIT

pragma solidity ^0.8.17;
import "@openzeppelin/contracts/interfaces/IERC1155.sol";
import "@openzeppelin/contracts/interfaces/IERC165.sol";
import "@openzeppelin/contracts/utils/Create2.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "./IController.sol";
import "hardhat/console.sol";

contract L2Registry is IERC1155 {
    mapping(uint256 => bytes) tokens;
    mapping(address => mapping(address => bool)) approvals;

    error TokenDoesNotExist(uint256 id);

    constructor(bytes memory root) {
        tokens[0] = root;
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

    function setApprovalForAll(address operator, bool approved) external {
        approvals[msg.sender][operator] = approved;
        emit ApprovalForAll(msg.sender, operator, approved);
    }

    function isApprovedForAll(
        address owner,
        address operator
    ) external view returns (bool) {
        return approvals[owner][operator];
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

    function setNode(uint256 id, bytes memory data) external {
        require(address(_getController(tokens[id])) == msg.sender);
        tokens[id] = data;
    }

    function setSubnode(
        uint256 id,
        uint256 label,
        bytes memory tokenData,
        address operator,
        address to
    ) external {
        console.log("Calling setSubnode");
        console.log(id);
        console.log(label);
        console.logBytes(tokenData);
        console.log(operator);
        console.log(to);
        console.log(11);
        require(address(_getController(tokens[id])) == msg.sender);
        console.log(12);
        uint256 subnode = uint256(keccak256(abi.encodePacked(id, label)));
        console.log(13);
        bytes memory oldTokenData = tokens[subnode];
        console.log(14);
        IController oldController = _getController(oldTokenData);
        console.log(15);
        address oldOwner = address(oldController) == address(0)
            ? address(0)
            : oldController.ownerOf(oldTokenData);
        console.log(16);
        tokens[subnode] = tokenData;
        console.log(17);
        if (to == address(0)) {
            console.log(18);
            to = _getController(tokenData).ownerOf(tokenData);
            console.log(19);
            console.log(to);
        }
        console.log(20);
        emit TransferSingle(operator, oldOwner, to, subnode, 1);
    }

    function controller(uint256 id) external view returns (IController) {
        return _getController(tokens[id]);
    }

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
        require(from == msg.sender || approvals[from][msg.sender]);
        bytes memory tokenData = tokens[id];
        IController _controller = _getController(tokenData);
        if (address(_controller) == address(0)) {
            revert TokenDoesNotExist(id);
        }
        tokens[id] = _controller.safeTransferFrom(
            tokenData,
            msg.sender,
            from,
            to,
            id,
            value,
            data
        );
    }
}
