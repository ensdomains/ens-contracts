// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "forge-std/Test.sol";
import "../../../contracts/wrapper/NameWrapper.sol";
import "../../../contracts/registry/ENSRegistry.sol";
import "../../../contracts/ethregistrar/BaseRegistrarImplementation.sol";
import "../../../contracts/wrapper/IMetadataService.sol";
import {ReverseRegistrar} from "../../../contracts/reverseRegistrar/ReverseRegistrar.sol";
import "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import "@openzeppelin/contracts/token/ERC1155/extensions/IERC1155MetadataURI.sol";
import "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import {MockMetadataService} from "../../utils/MockMetadataService.sol";
import {INameWrapper, CANNOT_UNWRAP, PARENT_CANNOT_CONTROL, CAN_DO_EVERYTHING, IS_DOT_ETH} from "../../../contracts/wrapper/INameWrapper.sol";

/**
 * @title ERC1155Behavior
 * @dev ERC1155 behavior tests for NameWrapper
 */
contract ERC1155Behavior is Test {
    // ERC1155 constants
    bytes4 constant RECEIVER_SINGLE_MAGIC_VALUE = 0xf23a6e61;
    bytes4 constant RECEIVER_BATCH_MAGIC_VALUE = 0xbc197c81;

    // Test accounts
    address constant MINTER = address(0x1);
    address constant FIRST_TOKEN_HOLDER = address(0x2);
    address constant SECOND_TOKEN_HOLDER = address(0x3);
    address constant MULTI_TOKEN_HOLDER = address(0x4);
    address constant RECIPIENT = address(0x5);
    address constant PROXY = address(0x6);
    address constant OTHER = address(0x7);

    // Test token IDs
    uint256 constant FIRST_TOKEN_ID = 1;
    uint256 constant SECOND_TOKEN_ID = 2;
    uint256 constant UNKNOWN_TOKEN_ID = 3;

    // ENS constants
    bytes32 constant ROOT_NODE = bytes32(0);
    bytes32 constant ETH_LABEL = keccak256("eth");
    bytes32 constant ETH_NODE =
        keccak256(abi.encodePacked(ROOT_NODE, ETH_LABEL));

    // Test domains
    string constant FIRST_LABEL = "first";
    bytes32 constant FIRST_LABEL_HASH = keccak256(bytes(FIRST_LABEL));
    uint256 constant FIRST_LABEL_ID = uint256(FIRST_LABEL_HASH);
    bytes32 constant FIRST_NODE =
        keccak256(abi.encodePacked(ETH_NODE, FIRST_LABEL_HASH));

    string constant SECOND_LABEL = "second";
    bytes32 constant SECOND_LABEL_HASH = keccak256(bytes(SECOND_LABEL));
    uint256 constant SECOND_LABEL_ID = uint256(SECOND_LABEL_HASH);
    bytes32 constant SECOND_NODE =
        keccak256(abi.encodePacked(ETH_NODE, SECOND_LABEL_HASH));

    // Contracts
    NameWrapper public nameWrapper;
    ENSRegistry public ens;
    BaseRegistrarImplementation public baseRegistrar;
    ReverseRegistrar public reverseRegistrar;
    IMetadataService public metadataService;

    // Events from ERC1155
    event TransferSingle(
        address indexed operator,
        address indexed from,
        address indexed to,
        uint256 id,
        uint256 value
    );
    event TransferBatch(
        address indexed operator,
        address indexed from,
        address indexed to,
        uint256[] ids,
        uint256[] values
    );
    event ApprovalForAll(
        address indexed account,
        address indexed operator,
        bool approved
    );
    event URI(string value, uint256 indexed id);

    // Struct for contract state
    struct ContractState {
        address minter;
        address firstTokenHolder;
        address secondTokenHolder;
        address multiTokenHolder;
        address recipient;
        address proxy;
        NameWrapper contract_;
    }

    function setUp() public {
        vm.startPrank(MINTER);

        // Deploy core contracts
        ens = new ENSRegistry();
        baseRegistrar = new BaseRegistrarImplementation(ens, ETH_NODE);
        metadataService = IMetadataService(address(new MockMetadataService()));

        // Deploy reverse registrar
        reverseRegistrar = new ReverseRegistrar(ens);

        // Set up reverse registry
        ens.setSubnodeOwner(ROOT_NODE, keccak256("reverse"), MINTER);
        ens.setSubnodeOwner(
            keccak256(abi.encodePacked(ROOT_NODE, keccak256("reverse"))),
            keccak256("addr"),
            address(reverseRegistrar)
        );

        // Deploy name wrapper
        nameWrapper = new NameWrapper(ens, baseRegistrar, metadataService);

        // Set up domain ownership
        ens.setSubnodeOwner(ROOT_NODE, ETH_LABEL, address(baseRegistrar));
        baseRegistrar.addController(address(nameWrapper));
        baseRegistrar.addController(MINTER);

        vm.stopPrank();
    }

    // Fixture functions
    function _contracts() internal view returns (ContractState memory) {
        return
            ContractState({
                minter: MINTER,
                firstTokenHolder: FIRST_TOKEN_HOLDER,
                secondTokenHolder: SECOND_TOKEN_HOLDER,
                multiTokenHolder: MULTI_TOKEN_HOLDER,
                recipient: RECIPIENT,
                proxy: PROXY,
                contract_: nameWrapper
            });
    }

    function _mint(address[] memory addresses) internal {
        vm.startPrank(MINTER);

        // Move past grace period
        vm.warp(block.timestamp + baseRegistrar.GRACE_PERIOD() + 1);

        // Register and wrap first domain for first holder
        if (addresses.length > 0) {
            baseRegistrar.register(FIRST_LABEL_ID, MINTER, 365 days);
            baseRegistrar.setApprovalForAll(address(nameWrapper), true);
            nameWrapper.wrapETH2LD(
                FIRST_LABEL,
                addresses[0],
                uint16(CAN_DO_EVERYTHING),
                address(0)
            );
        }

        // Register and wrap second domain for second holder
        if (addresses.length > 1) {
            baseRegistrar.register(SECOND_LABEL_ID, MINTER, 365 days);
            nameWrapper.wrapETH2LD(
                SECOND_LABEL,
                addresses[1],
                uint16(CAN_DO_EVERYTHING),
                address(0)
            );
        }

        vm.stopPrank();
    }

    function _mintedToMultiFixture() internal returns (ContractState memory) {
        ContractState memory state = _contracts();
        address[] memory addresses = new address[](2);
        addresses[0] = state.multiTokenHolder;
        addresses[1] = state.multiTokenHolder;
        _mint(addresses);
        return state;
    }

    // Test interface support
    function testSupportsInterface() public {
        assertTrue(
            nameWrapper.supportsInterface(type(IERC1155).interfaceId),
            "Should support IERC1155"
        );
        assertTrue(
            nameWrapper.supportsInterface(
                type(IERC1155MetadataURI).interfaceId
            ),
            "Should support IERC1155MetadataURI"
        );
        assertTrue(
            nameWrapper.supportsInterface(type(IERC165).interfaceId),
            "Should support IERC165"
        );
    }

    // === balanceOf tests ===

    function testBalanceOfRevertsWhenQueriedAboutZeroAddress() public {
        vm.expectRevert("ERC1155: balance query for the zero address");
        nameWrapper.balanceOf(address(0), FIRST_TOKEN_ID);
    }

    function testBalanceOfWhenAccountsDontOwnTokens() public {
        ContractState memory state = _contracts();

        assertEq(
            nameWrapper.balanceOf(state.firstTokenHolder, FIRST_TOKEN_ID),
            0,
            "First holder should have zero balance"
        );
        assertEq(
            nameWrapper.balanceOf(state.secondTokenHolder, SECOND_TOKEN_ID),
            0,
            "Second holder should have zero balance"
        );
        assertEq(
            nameWrapper.balanceOf(state.firstTokenHolder, UNKNOWN_TOKEN_ID),
            0,
            "Unknown token should have zero balance"
        );
    }

    function testBalanceOfWhenAccountsOwnTokens() public {
        ContractState memory state = _contracts();
        address[] memory addresses = new address[](2);
        addresses[0] = state.firstTokenHolder;
        addresses[1] = state.secondTokenHolder;
        _mint(addresses);

        assertEq(
            nameWrapper.balanceOf(state.firstTokenHolder, uint256(FIRST_NODE)),
            1,
            "First holder should own first token"
        );
        assertEq(
            nameWrapper.balanceOf(
                state.secondTokenHolder,
                uint256(SECOND_NODE)
            ),
            1,
            "Second holder should own second token"
        );
        assertEq(
            nameWrapper.balanceOf(state.firstTokenHolder, UNKNOWN_TOKEN_ID),
            0,
            "Unknown token should have zero balance"
        );
    }

    // === balanceOfBatch tests ===

    function testBalanceOfBatchRevertsWhenInputArraysDontMatch() public {
        ContractState memory state = _contracts();

        address[] memory accounts = new address[](4);
        accounts[0] = state.firstTokenHolder;
        accounts[1] = state.secondTokenHolder;
        accounts[2] = state.firstTokenHolder;
        accounts[3] = state.secondTokenHolder;

        uint256[] memory ids = new uint256[](3);
        ids[0] = FIRST_TOKEN_ID;
        ids[1] = SECOND_TOKEN_ID;
        ids[2] = UNKNOWN_TOKEN_ID;

        vm.expectRevert("ERC1155: accounts and ids length mismatch");
        nameWrapper.balanceOfBatch(accounts, ids);

        address[] memory accounts2 = new address[](2);
        accounts2[0] = state.firstTokenHolder;
        accounts2[1] = state.secondTokenHolder;

        uint256[] memory ids2 = new uint256[](3);
        ids2[0] = FIRST_TOKEN_ID;
        ids2[1] = SECOND_TOKEN_ID;
        ids2[2] = UNKNOWN_TOKEN_ID;

        vm.expectRevert("ERC1155: accounts and ids length mismatch");
        nameWrapper.balanceOfBatch(accounts2, ids2);
    }

    function testBalanceOfBatchRevertsWhenOneOfAddressesIsZeroAddress() public {
        ContractState memory state = _contracts();

        address[] memory accounts = new address[](3);
        accounts[0] = state.firstTokenHolder;
        accounts[1] = state.secondTokenHolder;
        accounts[2] = address(0);

        uint256[] memory ids = new uint256[](3);
        ids[0] = FIRST_TOKEN_ID;
        ids[1] = SECOND_TOKEN_ID;
        ids[2] = UNKNOWN_TOKEN_ID;

        vm.expectRevert("ERC1155: balance query for the zero address");
        nameWrapper.balanceOfBatch(accounts, ids);
    }

    function testBalanceOfBatchWhenAccountsDontOwnTokens() public {
        ContractState memory state = _contracts();

        address[] memory accounts = new address[](3);
        accounts[0] = state.firstTokenHolder;
        accounts[1] = state.secondTokenHolder;
        accounts[2] = state.firstTokenHolder;

        uint256[] memory ids = new uint256[](3);
        ids[0] = FIRST_TOKEN_ID;
        ids[1] = SECOND_TOKEN_ID;
        ids[2] = UNKNOWN_TOKEN_ID;

        uint256[] memory balances = nameWrapper.balanceOfBatch(accounts, ids);
        uint256[] memory expected = new uint256[](3);
        expected[0] = 0;
        expected[1] = 0;
        expected[2] = 0;

        for (uint256 i = 0; i < balances.length; i++) {
            assertEq(balances[i], expected[i], "Balance should be zero");
        }
    }

    function testBalanceOfBatchWhenAccountsOwnTokens() public {
        ContractState memory state = _contracts();
        address[] memory mintAddresses = new address[](2);
        mintAddresses[0] = state.firstTokenHolder;
        mintAddresses[1] = state.secondTokenHolder;
        _mint(mintAddresses);

        address[] memory accounts = new address[](3);
        accounts[0] = state.secondTokenHolder;
        accounts[1] = state.firstTokenHolder;
        accounts[2] = state.firstTokenHolder;

        uint256[] memory ids = new uint256[](3);
        ids[0] = uint256(SECOND_NODE);
        ids[1] = uint256(FIRST_NODE);
        ids[2] = UNKNOWN_TOKEN_ID;

        uint256[] memory balances = nameWrapper.balanceOfBatch(accounts, ids);
        uint256[] memory expected = new uint256[](3);
        expected[0] = 1;
        expected[1] = 1;
        expected[2] = 0;

        for (uint256 i = 0; i < balances.length; i++) {
            assertEq(balances[i], expected[i], "Balance should match expected");
        }
    }

    function testBalanceOfBatchMultipleTimesForSameAddress() public {
        ContractState memory state = _contracts();
        address[] memory mintAddresses = new address[](2);
        mintAddresses[0] = state.firstTokenHolder;
        mintAddresses[1] = state.secondTokenHolder;
        _mint(mintAddresses);

        address[] memory accounts = new address[](3);
        accounts[0] = state.firstTokenHolder;
        accounts[1] = state.secondTokenHolder;
        accounts[2] = state.firstTokenHolder;

        uint256[] memory ids = new uint256[](3);
        ids[0] = uint256(FIRST_NODE);
        ids[1] = uint256(SECOND_NODE);
        ids[2] = uint256(FIRST_NODE);

        uint256[] memory balances = nameWrapper.balanceOfBatch(accounts, ids);
        uint256[] memory expected = new uint256[](3);
        expected[0] = 1;
        expected[1] = 1;
        expected[2] = 1;

        for (uint256 i = 0; i < balances.length; i++) {
            assertEq(balances[i], expected[i], "Balance should match expected");
        }
    }

    // === setApprovalForAll tests ===

    function testSetApprovalForAllSetsApprovalStatusWhichCanBeQueriedViaIsApprovedForAll()
        public
    {
        ContractState memory state = _contracts();

        vm.prank(state.multiTokenHolder);
        nameWrapper.setApprovalForAll(state.proxy, true);

        assertTrue(
            nameWrapper.isApprovedForAll(state.multiTokenHolder, state.proxy),
            "Should be approved"
        );
    }

    function testSetApprovalForAllEmitsApprovalForAllLog() public {
        ContractState memory state = _contracts();

        vm.prank(state.multiTokenHolder);
        vm.expectEmit(true, true, false, true);
        emit ApprovalForAll(state.multiTokenHolder, state.proxy, true);
        nameWrapper.setApprovalForAll(state.proxy, true);
    }

    function testSetApprovalForAllCanUnsetApprovalForOperator() public {
        ContractState memory state = _contracts();

        vm.prank(state.multiTokenHolder);
        nameWrapper.setApprovalForAll(state.proxy, true);

        vm.prank(state.multiTokenHolder);
        nameWrapper.setApprovalForAll(state.proxy, false);

        assertFalse(
            nameWrapper.isApprovedForAll(state.multiTokenHolder, state.proxy),
            "Should not be approved"
        );
    }

    function testSetApprovalForAllRevertsIfAttemptingToApproveSelfAsOperator()
        public
    {
        ContractState memory state = _contracts();

        vm.prank(state.multiTokenHolder);
        vm.expectRevert("ERC1155: setting approval status for self");
        nameWrapper.setApprovalForAll(state.multiTokenHolder, true);
    }

    // === safeTransferFrom tests ===

    function testSafeTransferFromRevertsWhenTransferringMoreThanBalance()
        public
    {
        ContractState memory state = _mintedToMultiFixture();

        vm.prank(state.multiTokenHolder);
        vm.expectRevert("ERC1155: insufficient balance for transfer");
        nameWrapper.safeTransferFrom(
            state.multiTokenHolder,
            state.recipient,
            uint256(FIRST_NODE),
            2,
            ""
        );
    }

    function testSafeTransferFromRevertsWhenTransferringToZeroAddress() public {
        ContractState memory state = _mintedToMultiFixture();

        vm.prank(state.multiTokenHolder);
        vm.expectRevert("ERC1155: transfer to the zero address");
        nameWrapper.safeTransferFrom(
            state.multiTokenHolder,
            address(0),
            uint256(FIRST_NODE),
            1,
            ""
        );
    }

    // Helper for transfer success validation
    function _validateTransferSuccess(
        address operator,
        address from,
        address to,
        uint256 id,
        uint256 value,
        bytes32 txHash
    ) internal {
        // Validate balance changes
        assertEq(
            nameWrapper.balanceOf(from, id),
            0,
            "Sender balance should be debited"
        );
        assertEq(
            nameWrapper.balanceOf(to, id),
            value,
            "Recipient balance should be credited"
        );

        // Validate event emission
        vm.expectEmit(true, true, true, true);
        emit TransferSingle(operator, from, to, id, value);
    }

    function testSafeTransferFromWhenCalledByMultiTokenHolder() public {
        ContractState memory state = _mintedToMultiFixture();

        uint256 balanceBefore = nameWrapper.balanceOf(
            state.multiTokenHolder,
            uint256(FIRST_NODE)
        );
        assertEq(balanceBefore, 1, "Should have token before transfer");

        vm.prank(state.multiTokenHolder);
        vm.expectEmit(true, true, true, true);
        emit TransferSingle(
            state.multiTokenHolder,
            state.multiTokenHolder,
            state.recipient,
            uint256(FIRST_NODE),
            1
        );
        nameWrapper.safeTransferFrom(
            state.multiTokenHolder,
            state.recipient,
            uint256(FIRST_NODE),
            1,
            ""
        );

        // Validate transfer success
        assertEq(
            nameWrapper.balanceOf(state.multiTokenHolder, uint256(FIRST_NODE)),
            0,
            "Sender balance should be debited"
        );
        assertEq(
            nameWrapper.balanceOf(state.recipient, uint256(FIRST_NODE)),
            1,
            "Recipient balance should be credited"
        );

        // Validate preserved balances
        assertEq(
            nameWrapper.balanceOf(state.multiTokenHolder, uint256(SECOND_NODE)),
            1,
            "Other token balance should be preserved"
        );
        assertEq(
            nameWrapper.balanceOf(state.recipient, uint256(SECOND_NODE)),
            0,
            "Recipient other token balance should be zero"
        );
    }

    function testSafeTransferFromWhenCalledByOperatorNotApproved() public {
        ContractState memory state = _mintedToMultiFixture();

        vm.prank(state.proxy);
        vm.expectRevert("ERC1155: caller is not owner nor approved");
        nameWrapper.safeTransferFrom(
            state.multiTokenHolder,
            state.recipient,
            uint256(FIRST_NODE),
            1,
            ""
        );
    }

    function testSafeTransferFromWhenCalledByOperatorApproved() public {
        ContractState memory state = _mintedToMultiFixture();

        // Set approval
        vm.prank(state.multiTokenHolder);
        nameWrapper.setApprovalForAll(state.proxy, true);

        vm.prank(state.proxy);
        vm.expectEmit(true, true, true, true);
        emit TransferSingle(
            state.proxy,
            state.multiTokenHolder,
            state.recipient,
            uint256(FIRST_NODE),
            1
        );
        nameWrapper.safeTransferFrom(
            state.multiTokenHolder,
            state.recipient,
            uint256(FIRST_NODE),
            1,
            ""
        );

        // Validate transfer success
        assertEq(
            nameWrapper.balanceOf(state.multiTokenHolder, uint256(FIRST_NODE)),
            0,
            "Sender balance should be debited"
        );
        assertEq(
            nameWrapper.balanceOf(state.recipient, uint256(FIRST_NODE)),
            1,
            "Recipient balance should be credited"
        );

        // Validate operator balances not affected
        assertEq(
            nameWrapper.balanceOf(state.proxy, uint256(FIRST_NODE)),
            0,
            "Operator balance should remain zero"
        );
        assertEq(
            nameWrapper.balanceOf(state.proxy, uint256(SECOND_NODE)),
            0,
            "Operator other balance should remain zero"
        );
    }

    // === ERC1155 Receiver tests ===

    function testSafeTransferFromToValidReceiverWithoutData() public {
        ContractState memory state = _mintedToMultiFixture();

        ERC1155ReceiverMock receiver = new ERC1155ReceiverMock(
            RECEIVER_SINGLE_MAGIC_VALUE,
            false,
            RECEIVER_BATCH_MAGIC_VALUE,
            false
        );

        vm.prank(state.multiTokenHolder);
        vm.expectEmit(true, true, true, true);
        emit TransferSingle(
            state.multiTokenHolder,
            state.multiTokenHolder,
            address(receiver),
            uint256(FIRST_NODE),
            1
        );
        nameWrapper.safeTransferFrom(
            state.multiTokenHolder,
            address(receiver),
            uint256(FIRST_NODE),
            1,
            ""
        );

        // Validate transfer success
        assertEq(
            nameWrapper.balanceOf(state.multiTokenHolder, uint256(FIRST_NODE)),
            0,
            "Sender balance should be debited"
        );
        assertEq(
            nameWrapper.balanceOf(address(receiver), uint256(FIRST_NODE)),
            1,
            "Receiver balance should be credited"
        );
    }

    function testSafeTransferFromToValidReceiverWithData() public {
        ContractState memory state = _mintedToMultiFixture();

        ERC1155ReceiverMock receiver = new ERC1155ReceiverMock(
            RECEIVER_SINGLE_MAGIC_VALUE,
            false,
            RECEIVER_BATCH_MAGIC_VALUE,
            false
        );

        vm.prank(state.multiTokenHolder);
        vm.expectEmit(true, true, true, true);
        emit TransferSingle(
            state.multiTokenHolder,
            state.multiTokenHolder,
            address(receiver),
            uint256(FIRST_NODE),
            1
        );
        nameWrapper.safeTransferFrom(
            state.multiTokenHolder,
            address(receiver),
            uint256(FIRST_NODE),
            1,
            hex"f00dd00d"
        );

        // Validate transfer success
        assertEq(
            nameWrapper.balanceOf(state.multiTokenHolder, uint256(FIRST_NODE)),
            0,
            "Sender balance should be debited"
        );
        assertEq(
            nameWrapper.balanceOf(address(receiver), uint256(FIRST_NODE)),
            1,
            "Receiver balance should be credited"
        );
    }

    function testSafeTransferFromToReceiverReturningUnexpectedValue() public {
        ContractState memory state = _mintedToMultiFixture();

        ERC1155ReceiverMock receiver = new ERC1155ReceiverMock(
            0x00c0ffee,
            false,
            RECEIVER_BATCH_MAGIC_VALUE,
            false
        );

        vm.prank(state.multiTokenHolder);
        vm.expectRevert("ERC1155: ERC1155Receiver rejected tokens");
        nameWrapper.safeTransferFrom(
            state.multiTokenHolder,
            address(receiver),
            uint256(FIRST_NODE),
            1,
            ""
        );
    }

    function testSafeTransferFromToReceiverThatReverts() public {
        ContractState memory state = _mintedToMultiFixture();

        ERC1155ReceiverMock receiver = new ERC1155ReceiverMock(
            RECEIVER_SINGLE_MAGIC_VALUE,
            true,
            RECEIVER_BATCH_MAGIC_VALUE,
            false
        );

        vm.prank(state.multiTokenHolder);
        vm.expectRevert("ERC1155ReceiverMock: reverting on receive");
        nameWrapper.safeTransferFrom(
            state.multiTokenHolder,
            address(receiver),
            uint256(FIRST_NODE),
            1,
            ""
        );
    }

    function testSafeTransferFromToContractThatDoesNotImplementRequiredFunction()
        public
    {
        ContractState memory state = _mintedToMultiFixture();

        vm.prank(state.multiTokenHolder);
        vm.expectRevert("ERC1155: transfer to non ERC1155Receiver implementer");
        nameWrapper.safeTransferFrom(
            state.multiTokenHolder,
            address(nameWrapper),
            uint256(FIRST_NODE),
            1,
            ""
        );
    }

    // === safeBatchTransferFrom tests ===

    function testSafeBatchTransferFromRevertsWhenTransferringMoreThanBalance()
        public
    {
        ContractState memory state = _mintedToMultiFixture();

        uint256[] memory ids = new uint256[](2);
        ids[0] = uint256(FIRST_NODE);
        ids[1] = uint256(SECOND_NODE);

        uint256[] memory amounts = new uint256[](2);
        amounts[0] = 1;
        amounts[1] = 2;

        vm.prank(state.multiTokenHolder);
        vm.expectRevert("ERC1155: insufficient balance for transfer");
        nameWrapper.safeBatchTransferFrom(
            state.multiTokenHolder,
            state.recipient,
            ids,
            amounts,
            ""
        );
    }

    function testSafeBatchTransferFromRevertsWhenIdsArrayLengthDoesntMatchAmountsArrayLength()
        public
    {
        ContractState memory state = _mintedToMultiFixture();

        uint256[] memory ids1 = new uint256[](1);
        ids1[0] = uint256(FIRST_NODE);

        uint256[] memory amounts1 = new uint256[](2);
        amounts1[0] = 1;
        amounts1[1] = 1;

        vm.prank(state.multiTokenHolder);
        vm.expectRevert("ERC1155: ids and amounts length mismatch");
        nameWrapper.safeBatchTransferFrom(
            state.multiTokenHolder,
            state.recipient,
            ids1,
            amounts1,
            ""
        );

        uint256[] memory ids2 = new uint256[](2);
        ids2[0] = uint256(FIRST_NODE);
        ids2[1] = uint256(SECOND_NODE);

        uint256[] memory amounts2 = new uint256[](1);
        amounts2[0] = 1;

        vm.prank(state.multiTokenHolder);
        vm.expectRevert("ERC1155: ids and amounts length mismatch");
        nameWrapper.safeBatchTransferFrom(
            state.multiTokenHolder,
            state.recipient,
            ids2,
            amounts2,
            ""
        );
    }

    function testSafeBatchTransferFromRevertsWhenTransferringToZeroAddress()
        public
    {
        ContractState memory state = _mintedToMultiFixture();

        uint256[] memory ids = new uint256[](2);
        ids[0] = uint256(FIRST_NODE);
        ids[1] = uint256(SECOND_NODE);

        uint256[] memory amounts = new uint256[](2);
        amounts[0] = 1;
        amounts[1] = 1;

        vm.prank(state.multiTokenHolder);
        vm.expectRevert("ERC1155: transfer to the zero address");
        nameWrapper.safeBatchTransferFrom(
            state.multiTokenHolder,
            address(0),
            ids,
            amounts,
            ""
        );
    }

    function testSafeBatchTransferFromWhenCalledByMultiTokenHolder() public {
        ContractState memory state = _mintedToMultiFixture();

        uint256[] memory ids = new uint256[](2);
        ids[0] = uint256(FIRST_NODE);
        ids[1] = uint256(SECOND_NODE);

        uint256[] memory amounts = new uint256[](2);
        amounts[0] = 1;
        amounts[1] = 1;

        vm.prank(state.multiTokenHolder);
        vm.expectEmit(true, true, true, true);
        emit TransferBatch(
            state.multiTokenHolder,
            state.multiTokenHolder,
            state.recipient,
            ids,
            amounts
        );
        nameWrapper.safeBatchTransferFrom(
            state.multiTokenHolder,
            state.recipient,
            ids,
            amounts,
            ""
        );

        // Validate batch transfer success
        address[] memory senderAddresses = new address[](2);
        senderAddresses[0] = state.multiTokenHolder;
        senderAddresses[1] = state.multiTokenHolder;

        address[] memory recipientAddresses = new address[](2);
        recipientAddresses[0] = state.recipient;
        recipientAddresses[1] = state.recipient;

        uint256[] memory senderBalances = nameWrapper.balanceOfBatch(
            senderAddresses,
            ids
        );
        uint256[] memory recipientBalances = nameWrapper.balanceOfBatch(
            recipientAddresses,
            ids
        );

        for (uint256 i = 0; i < ids.length; i++) {
            assertEq(senderBalances[i], 0, "Sender balance should be debited");
            assertEq(
                recipientBalances[i],
                amounts[i],
                "Recipient balance should be credited"
            );
        }
    }

    function testSafeBatchTransferFromWhenCalledByOperatorNotApproved() public {
        ContractState memory state = _mintedToMultiFixture();

        uint256[] memory ids = new uint256[](2);
        ids[0] = uint256(FIRST_NODE);
        ids[1] = uint256(SECOND_NODE);

        uint256[] memory amounts = new uint256[](2);
        amounts[0] = 1;
        amounts[1] = 1;

        vm.prank(state.proxy);
        vm.expectRevert("ERC1155: transfer caller is not owner nor approved");
        nameWrapper.safeBatchTransferFrom(
            state.multiTokenHolder,
            state.recipient,
            ids,
            amounts,
            ""
        );
    }

    function testSafeBatchTransferFromWhenCalledByOperatorApproved() public {
        ContractState memory state = _mintedToMultiFixture();

        // Set approval
        vm.prank(state.multiTokenHolder);
        nameWrapper.setApprovalForAll(state.proxy, true);

        uint256[] memory ids = new uint256[](2);
        ids[0] = uint256(FIRST_NODE);
        ids[1] = uint256(SECOND_NODE);

        uint256[] memory amounts = new uint256[](2);
        amounts[0] = 1;
        amounts[1] = 1;

        vm.prank(state.proxy);
        vm.expectEmit(true, true, true, true);
        emit TransferBatch(
            state.proxy,
            state.multiTokenHolder,
            state.recipient,
            ids,
            amounts
        );
        nameWrapper.safeBatchTransferFrom(
            state.multiTokenHolder,
            state.recipient,
            ids,
            amounts,
            ""
        );

        // Validate operator balances not affected
        assertEq(
            nameWrapper.balanceOf(state.proxy, uint256(FIRST_NODE)),
            0,
            "Operator balance should remain zero"
        );
        assertEq(
            nameWrapper.balanceOf(state.proxy, uint256(SECOND_NODE)),
            0,
            "Operator other balance should remain zero"
        );
    }

    // === Batch ERC1155 Receiver tests ===

    function testSafeBatchTransferFromToValidReceiverWithoutData() public {
        ContractState memory state = _mintedToMultiFixture();

        ERC1155ReceiverMock receiver = new ERC1155ReceiverMock(
            RECEIVER_SINGLE_MAGIC_VALUE,
            false,
            RECEIVER_BATCH_MAGIC_VALUE,
            false
        );

        uint256[] memory ids = new uint256[](2);
        ids[0] = uint256(FIRST_NODE);
        ids[1] = uint256(SECOND_NODE);

        uint256[] memory amounts = new uint256[](2);
        amounts[0] = 1;
        amounts[1] = 1;

        vm.prank(state.multiTokenHolder);
        vm.expectEmit(true, true, true, true);
        emit TransferBatch(
            state.multiTokenHolder,
            state.multiTokenHolder,
            address(receiver),
            ids,
            amounts
        );
        nameWrapper.safeBatchTransferFrom(
            state.multiTokenHolder,
            address(receiver),
            ids,
            amounts,
            ""
        );
    }

    function testSafeBatchTransferFromToValidReceiverWithData() public {
        ContractState memory state = _mintedToMultiFixture();

        ERC1155ReceiverMock receiver = new ERC1155ReceiverMock(
            RECEIVER_SINGLE_MAGIC_VALUE,
            false,
            RECEIVER_BATCH_MAGIC_VALUE,
            false
        );

        uint256[] memory ids = new uint256[](2);
        ids[0] = uint256(FIRST_NODE);
        ids[1] = uint256(SECOND_NODE);

        uint256[] memory amounts = new uint256[](2);
        amounts[0] = 1;
        amounts[1] = 1;

        vm.prank(state.multiTokenHolder);
        vm.expectEmit(true, true, true, true);
        emit TransferBatch(
            state.multiTokenHolder,
            state.multiTokenHolder,
            address(receiver),
            ids,
            amounts
        );
        nameWrapper.safeBatchTransferFrom(
            state.multiTokenHolder,
            address(receiver),
            ids,
            amounts,
            hex"f00dd00d"
        );
    }

    function testSafeBatchTransferFromToReceiverReturningUnexpectedValue()
        public
    {
        ContractState memory state = _mintedToMultiFixture();

        ERC1155ReceiverMock receiver = new ERC1155ReceiverMock(
            RECEIVER_SINGLE_MAGIC_VALUE,
            false,
            RECEIVER_SINGLE_MAGIC_VALUE,
            false
        );

        uint256[] memory ids = new uint256[](2);
        ids[0] = uint256(FIRST_NODE);
        ids[1] = uint256(SECOND_NODE);

        uint256[] memory amounts = new uint256[](2);
        amounts[0] = 1;
        amounts[1] = 1;

        vm.prank(state.multiTokenHolder);
        vm.expectRevert("ERC1155: ERC1155Receiver rejected tokens");
        nameWrapper.safeBatchTransferFrom(
            state.multiTokenHolder,
            address(receiver),
            ids,
            amounts,
            ""
        );
    }

    function testSafeBatchTransferFromToReceiverThatReverts() public {
        ContractState memory state = _mintedToMultiFixture();

        ERC1155ReceiverMock receiver = new ERC1155ReceiverMock(
            RECEIVER_SINGLE_MAGIC_VALUE,
            false,
            RECEIVER_BATCH_MAGIC_VALUE,
            true
        );

        uint256[] memory ids = new uint256[](2);
        ids[0] = uint256(FIRST_NODE);
        ids[1] = uint256(SECOND_NODE);

        uint256[] memory amounts = new uint256[](2);
        amounts[0] = 1;
        amounts[1] = 1;

        vm.prank(state.multiTokenHolder);
        vm.expectRevert("ERC1155ReceiverMock: reverting on batch receive");
        nameWrapper.safeBatchTransferFrom(
            state.multiTokenHolder,
            address(receiver),
            ids,
            amounts,
            ""
        );
    }

    function testSafeBatchTransferFromToReceiverThatRevertsOnlyOnSingleTransfers()
        public
    {
        ContractState memory state = _mintedToMultiFixture();

        ERC1155ReceiverMock receiver = new ERC1155ReceiverMock(
            RECEIVER_SINGLE_MAGIC_VALUE,
            true,
            RECEIVER_BATCH_MAGIC_VALUE,
            false
        );

        uint256[] memory ids = new uint256[](2);
        ids[0] = uint256(FIRST_NODE);
        ids[1] = uint256(SECOND_NODE);

        uint256[] memory amounts = new uint256[](2);
        amounts[0] = 1;
        amounts[1] = 1;

        vm.prank(state.multiTokenHolder);
        vm.expectEmit(true, true, true, true);
        emit TransferBatch(
            state.multiTokenHolder,
            state.multiTokenHolder,
            address(receiver),
            ids,
            amounts
        );
        nameWrapper.safeBatchTransferFrom(
            state.multiTokenHolder,
            address(receiver),
            ids,
            amounts,
            ""
        );
    }

    function testSafeBatchTransferFromToContractThatDoesNotImplementRequiredFunction()
        public
    {
        ContractState memory state = _mintedToMultiFixture();

        uint256[] memory ids = new uint256[](2);
        ids[0] = uint256(FIRST_NODE);
        ids[1] = uint256(SECOND_NODE);

        uint256[] memory amounts = new uint256[](2);
        amounts[0] = 1;
        amounts[1] = 1;

        vm.prank(state.multiTokenHolder);
        vm.expectRevert("ERC1155: transfer to non ERC1155Receiver implementer");
        nameWrapper.safeBatchTransferFrom(
            state.multiTokenHolder,
            address(nameWrapper),
            ids,
            amounts,
            ""
        );
    }
}

/**
 * @dev ERC1155ReceiverMock for testing ERC1155 receiver functionality
 */
contract ERC1155ReceiverMock {
    bytes4 private immutable _singleRetval;
    bool private immutable _singleRevert;
    bytes4 private immutable _batchRetval;
    bool private immutable _batchRevert;

    event Received(
        address operator,
        address from,
        uint256 id,
        uint256 value,
        bytes data
    );
    event BatchReceived(
        address operator,
        address from,
        uint256[] ids,
        uint256[] values,
        bytes data
    );

    constructor(
        bytes4 singleRetval,
        bool singleRevert,
        bytes4 batchRetval,
        bool batchRevert
    ) {
        _singleRetval = singleRetval;
        _singleRevert = singleRevert;
        _batchRetval = batchRetval;
        _batchRevert = batchRevert;
    }

    function onERC1155Received(
        address operator,
        address from,
        uint256 id,
        uint256 value,
        bytes calldata data
    ) external returns (bytes4) {
        require(!_singleRevert, "ERC1155ReceiverMock: reverting on receive");
        emit Received(operator, from, id, value, data);
        return _singleRetval;
    }

    function onERC1155BatchReceived(
        address operator,
        address from,
        uint256[] calldata ids,
        uint256[] calldata values,
        bytes calldata data
    ) external returns (bytes4) {
        require(
            !_batchRevert,
            "ERC1155ReceiverMock: reverting on batch receive"
        );
        emit BatchReceived(operator, from, ids, values, data);
        return _batchRetval;
    }
}
