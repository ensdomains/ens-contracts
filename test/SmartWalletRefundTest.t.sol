// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";

import {ENSRegistry} from "contracts/registry/ENSRegistry.sol";
import {ENS} from "contracts/registry/ENS.sol";
import {BaseRegistrarImplementation} from "contracts/ethregistrar/BaseRegistrarImplementation.sol";
import {ReverseRegistrar} from "contracts/reverseRegistrar/ReverseRegistrar.sol";
import {DefaultReverseRegistrar} from "contracts/reverseRegistrar/DefaultReverseRegistrar.sol";
import {DummyOracle} from "contracts/ethregistrar/DummyOracle.sol";
import {StablePriceOracle, AggregatorInterface} from "contracts/ethregistrar/StablePriceOracle.sol";
import {IPriceOracle} from "contracts/ethregistrar/IPriceOracle.sol";
import {ETHRegistrarController} from "contracts/ethregistrar/ETHRegistrarController.sol";
import {IETHRegistrarController} from "contracts/ethregistrar/IETHRegistrarController.sol";
import {BulkRenewal} from "contracts/ethregistrar/BulkRenewal.sol";
import {StaticBulkRenewal} from "contracts/ethregistrar/StaticBulkRenewal.sol";
import {Resolver} from "contracts/resolvers/Resolver.sol";

// ============================================================================
// SMART ACCOUNT MOCKS FOR TESTING
// ============================================================================

/// @notice Mock smart contract wallet (e.g. Gnosis Safe, Argent, ERC-4337 Smart Account)
/// Executes state writes (SSTORE) and emits an event (LOG) in receive(), consuming > 2300 gas.
contract MockSmartAccount {
    event ReceivedEther(address indexed sender, uint256 amount);
    uint256 public totalReceived;
    uint256 public receiveCount;

    receive() external payable {
        // State writes (SSTORE) and event logging consume > 2300 gas.
        // Under .transfer() (2300 gas stipend), this reverts with out-of-gas.
        // Under .call{value: ...}(""), full forwarded gas allows completion.
        totalReceived += msg.value;
        receiveCount += 1;
        emit ReceivedEther(msg.sender, msg.value);
    }

    function execute(
        address target,
        uint256 value,
        bytes calldata data
    ) external payable returns (bool success, bytes memory result) {
        (success, result) = target.call{value: value}(data);
    }
}

/// @notice Smart account that always reverts upon receiving ETH (to test rollback / require(success))
contract RevertingSmartAccount {
    receive() external payable {
        revert("REFUND_REJECTED");
    }

    function execute(
        address target,
        uint256 value,
        bytes calldata data
    ) external payable returns (bool success, bytes memory result) {
        (success, result) = target.call{value: value}(data);
    }
}

/// @notice Smart account that attempts to reenter target contracts during the refund receive callback
contract ReentrantSmartAccount {
    address public target;
    bytes public reentrantCalldata;
    uint256 public reentrantValue;
    bool public attacked;
    bool public reentrancySucceeded;
    bytes public reentrancyReturnData;

    function setAttack(
        address _target,
        uint256 _value,
        bytes calldata _data
    ) external {
        target = _target;
        reentrantValue = _value;
        reentrantCalldata = _data;
        attacked = false;
        reentrancySucceeded = false;
        reentrancyReturnData = "";
    }

    receive() external payable {
        if (!attacked && target != address(0)) {
            attacked = true;
            (bool ok, bytes memory res) = target.call{value: reentrantValue}(
                reentrantCalldata
            );
            reentrancySucceeded = ok;
            reentrancyReturnData = res;
        }
    }

    function execute(
        address _target,
        uint256 _value,
        bytes calldata _data
    ) external payable returns (bool success, bytes memory result) {
        (success, result) = _target.call{value: _value}(_data);
    }
}

/// @notice Smart account owner for testing ETHRegistrarController.withdraw() reentrancy
contract ReentrantWithdrawOwner {
    ETHRegistrarController public controller;
    uint256 public reenteredBalanceSeen;
    bool public reentered;
    bool public secondWithdrawSucceeded;

    constructor(ETHRegistrarController _controller) {
        controller = _controller;
    }

    receive() external payable {
        if (!reentered) {
            reentered = true;
            reenteredBalanceSeen = address(controller).balance;
            // Attempt to reenter withdraw() while receiving first withdraw
            try controller.withdraw() {
                secondWithdrawSucceeded = true;
            } catch {
                secondWithdrawSucceeded = false;
            }
        }
    }
}

/// @notice Minimal resolver returning controller as interface implementer for BulkRenewal
contract MockBulkResolver {
    address public controller;

    constructor(address _controller) {
        controller = _controller;
    }

    function interfaceImplementer(
        bytes32,
        bytes4 interfaceId
    ) external view returns (address) {
        if (interfaceId == type(IETHRegistrarController).interfaceId) {
            return controller;
        }
        return address(0);
    }
}

// ============================================================================
// STANDALONE PATTERN MOCKS (FROM ORIGINAL PR 577)
// ============================================================================

contract LegacyRefundPattern {
    function processWithTransfer(address payable recipient) external payable {
        require(msg.value >= 1 ether, "Insufficient payment");
        uint256 fee = 1 ether;
        uint256 refund = msg.value - fee;
        if (refund > 0) {
            recipient.transfer(refund);
        }
    }
}

contract ModernRefundPattern {
    function processWithCall(address payable recipient) external payable {
        require(msg.value >= 1 ether, "Insufficient payment");
        uint256 fee = 1 ether;
        uint256 refund = msg.value - fee;
        if (refund > 0) {
            (bool success, ) = recipient.call{value: refund}("");
            require(success, "Refund failed");
        }
    }
}

// ============================================================================
// PRODUCTION REGRESSION TEST SUITE
// ============================================================================

contract SmartWalletRefundTest is Test {
    // Standalone patterns (retained from PR #577)
    MockSmartAccount public smartAccount;
    LegacyRefundPattern public legacyContract;
    ModernRefundPattern public modernContract;

    // Production ENS infrastructure
    ENSRegistry public ens;
    BaseRegistrarImplementation public baseRegistrar;
    ReverseRegistrar public reverseRegistrar;
    DefaultReverseRegistrar public defaultReverseRegistrar;
    DummyOracle public dummyOracle;
    StablePriceOracle public priceOracle;
    ETHRegistrarController public controller;
    BulkRenewal public bulkRenewal;
    StaticBulkRenewal public staticBulkRenewal;
    MockBulkResolver public bulkResolver;

    // Accounts
    RevertingSmartAccount public revertingAccount;
    ReentrantSmartAccount public reentrantAccount;

    bytes32 constant ETH_LABELHASH = keccak256(bytes("eth"));
    bytes32 constant ETH_NODE =
        0x93cdeb708b7545dc668eb9280176169d1c33cfd8ed6f04690a0bcc88a93fc4ae;
    uint256 constant MIN_COMMITMENT_AGE = 60; // 60 seconds
    uint256 constant MAX_COMMITMENT_AGE = 86400; // 1 day
    uint256 constant REGISTRATION_DURATION = 365 days;

    function setUp() public {
        // Warp timestamp beyond 90-day GRACE_PERIOD and MAX_COMMITMENT_AGE
        vm.warp(100 days);

        // Deploy pattern mocks (PR 577 original)
        smartAccount = new MockSmartAccount();
        legacyContract = new LegacyRefundPattern();
        modernContract = new ModernRefundPattern();

        revertingAccount = new RevertingSmartAccount();
        reentrantAccount = new ReentrantSmartAccount();

        // 1. Deploy ENS Registry
        ens = new ENSRegistry();

        // 2. Deploy BaseRegistrarImplementation for .eth
        baseRegistrar = new BaseRegistrarImplementation(ens, ETH_NODE);

        // 3. Set subnode owner for .eth to baseRegistrar in ENS
        ens.setSubnodeOwner(bytes32(0), ETH_LABELHASH, address(baseRegistrar));

        // 4. Deploy Reverse Registrars
        reverseRegistrar = new ReverseRegistrar(ens);
        defaultReverseRegistrar = new DefaultReverseRegistrar();

        // 5. Deploy Oracles ($1/ETH = 100000000 with 8 decimals)
        // Rate per second such that 1 year = exactly 1 ether for 5+ letter names
        dummyOracle = new DummyOracle(100000000);
        uint256[] memory rentPrices = new uint256[](5);
        rentPrices[0] = 0;
        rentPrices[1] = 0;
        rentPrices[2] = uint256(4 ether) / 365 days;
        rentPrices[3] = uint256(2 ether) / 365 days;
        rentPrices[4] = uint256(1 ether) / 365 days;
        priceOracle = new StablePriceOracle(
            AggregatorInterface(address(dummyOracle)),
            rentPrices
        );

        // 6. Deploy Production ETHRegistrarController
        controller = new ETHRegistrarController(
            baseRegistrar,
            priceOracle,
            MIN_COMMITMENT_AGE,
            MAX_COMMITMENT_AGE,
            reverseRegistrar,
            defaultReverseRegistrar,
            ens
        );

        // Authorize controller on baseRegistrar and reverseRegistrars
        baseRegistrar.addController(address(controller));
        baseRegistrar.addController(address(this)); // test helper
        reverseRegistrar.setController(address(controller), true);
        defaultReverseRegistrar.setController(address(controller), true);

        // 7. Setup resolver for .eth node to point to MockBulkResolver
        bulkResolver = new MockBulkResolver(address(controller));
        baseRegistrar.setResolver(address(bulkResolver));

        // 8. Deploy BulkRenewal contracts
        bulkRenewal = new BulkRenewal(ens);
        staticBulkRenewal = new StaticBulkRenewal(controller);

        // Fund test accounts
        vm.deal(address(this), 500 ether);
        vm.deal(address(smartAccount), 500 ether);
        vm.deal(address(revertingAccount), 500 ether);
        vm.deal(address(reentrantAccount), 500 ether);
    }

    // ========================================================================
    // HELPER FUNCTIONS
    // ========================================================================

    function _createAndCommitRegistration(
        string memory label,
        address ownerAddress
    ) internal returns (IETHRegistrarController.Registration memory reg) {
        reg = IETHRegistrarController.Registration({
            label: label,
            owner: ownerAddress,
            duration: REGISTRATION_DURATION,
            secret: bytes32(0),
            resolver: address(0),
            data: new bytes[](0),
            reverseRecord: 0,
            referrer: bytes32(0)
        });

        bytes32 commitment = controller.makeCommitment(reg);
        controller.commit(commitment);
        // Advance past minimum commitment age
        vm.warp(block.timestamp + MIN_COMMITMENT_AGE + 1);
    }

    // ========================================================================
    // ORIGINAL PR #577 TESTS (RETAINED FOR BACKWARD COMPATIBILITY)
    // ========================================================================

    function test_legacyTransferRevertsForSmartWallet() public {
        vm.expectRevert();
        legacyContract.processWithTransfer{value: 1.5 ether}(
            payable(address(smartAccount))
        );
    }

    function test_modernCallSucceedsForSmartWallet() public {
        uint256 initialBalance = address(smartAccount).balance;
        modernContract.processWithCall{value: 1.5 ether}(
            payable(address(smartAccount))
        );
        uint256 finalBalance = address(smartAccount).balance;
        assertEq(
            finalBalance - initialBalance,
            0.5 ether,
            "Smart account should receive full 0.5 ETH refund"
        );
    }

    // ========================================================================
    // REQUIREMENT 5: PRODUCTION CONTRACT EXCESS-VALUE REFUND TESTS
    // ========================================================================

    /// @notice 5a: Test excess-value refund in ETHRegistrarController.register()
    function test_production_register_smartWalletRefundSucceeds() public {
        string memory label = "smartuser";
        IETHRegistrarController.Registration memory reg = _createAndCommitRegistration(
            label,
            address(smartAccount)
        );

        IPriceOracle.Price memory price = controller.rentPrice(
            label,
            REGISTRATION_DURATION
        );
        uint256 totalPrice = price.base + price.premium;
        uint256 excess = 0.75 ether;
        uint256 payment = totalPrice + excess;

        uint256 balanceBefore = address(smartAccount).balance;
        uint256 receivedBefore = smartAccount.totalReceived();
        uint256 countBefore = smartAccount.receiveCount();

        bytes memory registerData = abi.encodeWithSelector(
            controller.register.selector,
            reg
        );

        // Execute registration from smart account with excess payment
        (bool ok, ) = smartAccount.execute(
            address(controller),
            payment,
            registerData
        );
        assertTrue(ok, "Registration call failed");

        // Verify smartAccount receive() state write and event counter executed
        assertEq(
            smartAccount.totalReceived() - receivedBefore,
            excess,
            "Smart account totalReceived mismatch"
        );
        assertEq(
            smartAccount.receiveCount() - countBefore,
            1,
            "Smart account receiveCount mismatch"
        );

        // Net balance deduction must equal exactly the name's totalPrice
        uint256 balanceAfter = address(smartAccount).balance;
        assertEq(
            balanceBefore - balanceAfter,
            totalPrice,
            "Net balance change should equal exact totalPrice"
        );

        // Verify name registered and owned
        bytes32 labelhash = keccak256(bytes(label));
        assertEq(
            baseRegistrar.ownerOf(uint256(labelhash)),
            address(smartAccount),
            "Owner should be smart account"
        );
    }

    /// @notice 5b: Test excess-value refund in ETHRegistrarController.renew()
    function test_production_renew_smartWalletRefundSucceeds() public {
        string memory label = "renewuser";
        // Pre-register name
        bytes32 labelhash = keccak256(bytes(label));
        baseRegistrar.register(
            uint256(labelhash),
            address(smartAccount),
            REGISTRATION_DURATION
        );
        uint256 expiryBefore = baseRegistrar.nameExpires(uint256(labelhash));

        IPriceOracle.Price memory price = controller.rentPrice(
            label,
            REGISTRATION_DURATION
        );
        uint256 excess = 0.4 ether;
        uint256 payment = price.base + excess;

        uint256 balanceBefore = address(smartAccount).balance;
        uint256 receivedBefore = smartAccount.totalReceived();

        bytes memory renewData = abi.encodeWithSelector(
            controller.renew.selector,
            label,
            REGISTRATION_DURATION,
            bytes32(0)
        );

        (bool ok, ) = smartAccount.execute(
            address(controller),
            payment,
            renewData
        );
        assertTrue(ok, "Renew call failed");

        // Verify refund received
        assertEq(
            smartAccount.totalReceived() - receivedBefore,
            excess,
            "Smart account totalReceived mismatch"
        );
        uint256 balanceAfter = address(smartAccount).balance;
        assertEq(
            balanceBefore - balanceAfter,
            price.base,
            "Net balance change should equal price.base"
        );

        // Verify name expiry extended
        uint256 expiryAfter = baseRegistrar.nameExpires(uint256(labelhash));
        assertEq(
            expiryAfter - expiryBefore,
            REGISTRATION_DURATION,
            "Expiry should be extended by duration"
        );
    }

    /// @notice 5c: Test ETHRegistrarController.withdraw() when owner is a smart contract wallet
    function test_production_withdraw_smartWalletOwnerSucceeds() public {
        // Transfer ownership of controller to smartAccount
        controller.transferOwnership(address(smartAccount));
        assertEq(controller.owner(), address(smartAccount));

        // Deposit funds into controller via registration
        string memory label = "deposituser";
        IETHRegistrarController.Registration memory reg = _createAndCommitRegistration(
            label,
            address(this)
        );
        IPriceOracle.Price memory price = controller.rentPrice(
            label,
            REGISTRATION_DURATION
        );
        controller.register{value: price.base + price.premium}(reg);

        uint256 controllerBalance = address(controller).balance;
        assertGt(controllerBalance, 0, "Controller should hold ETH");

        uint256 ownerBalanceBefore = address(smartAccount).balance;
        uint256 ownerReceivedBefore = smartAccount.totalReceived();

        // Anyone can trigger withdraw(), funds are transferred to owner()
        controller.withdraw();

        assertEq(
            address(controller).balance,
            0,
            "Controller balance should be 0 after withdraw"
        );
        assertEq(
            smartAccount.totalReceived() - ownerReceivedBefore,
            controllerBalance,
            "Owner smart account should receive full controller balance"
        );
        assertEq(
            address(smartAccount).balance - ownerBalanceBefore,
            controllerBalance,
            "Owner balance increase mismatch"
        );
    }

    /// @notice 5d: Test excess-value refund in BulkRenewal.renewAll()
    function test_production_bulkRenewal_smartWalletRefundSucceeds() public {
        string[] memory names = new string[](2);
        names[0] = "bulkuser1";
        names[1] = "bulkuser2";

        // Pre-register names
        for (uint256 i = 0; i < names.length; i++) {
            baseRegistrar.register(
                uint256(keccak256(bytes(names[i]))),
                address(smartAccount),
                REGISTRATION_DURATION
            );
        }

        uint256 totalCost = bulkRenewal.rentPrice(names, REGISTRATION_DURATION);
        uint256 excess = 1.25 ether;
        uint256 payment = totalCost + excess;

        uint256 balanceBefore = address(smartAccount).balance;
        uint256 receivedBefore = smartAccount.totalReceived();

        bytes memory renewData = abi.encodeWithSelector(
            bulkRenewal.renewAll.selector,
            names,
            REGISTRATION_DURATION,
            bytes32(0)
        );

        (bool ok, ) = smartAccount.execute(
            address(bulkRenewal),
            payment,
            renewData
        );
        assertTrue(ok, "Bulk renewal failed");

        assertEq(
            smartAccount.totalReceived() - receivedBefore,
            excess,
            "Smart account should receive excess refund from BulkRenewal"
        );
        assertEq(
            balanceBefore - address(smartAccount).balance,
            totalCost,
            "Net cost should equal exact total renewal price"
        );
    }

    /// @notice 5e: Test excess-value refund in StaticBulkRenewal.renewAll()
    function test_production_staticBulkRenewal_smartWalletRefundSucceeds() public {
        string[] memory names = new string[](2);
        names[0] = "staticuser1";
        names[1] = "staticuser2";

        // Pre-register names
        for (uint256 i = 0; i < names.length; i++) {
            baseRegistrar.register(
                uint256(keccak256(bytes(names[i]))),
                address(smartAccount),
                REGISTRATION_DURATION
            );
        }

        uint256 totalCost = staticBulkRenewal.rentPrice(
            names,
            REGISTRATION_DURATION
        );
        uint256 excess = 0.95 ether;
        uint256 payment = totalCost + excess;

        uint256 balanceBefore = address(smartAccount).balance;
        uint256 receivedBefore = smartAccount.totalReceived();

        bytes memory renewData = abi.encodeWithSelector(
            staticBulkRenewal.renewAll.selector,
            names,
            REGISTRATION_DURATION,
            bytes32(0)
        );

        (bool ok, ) = smartAccount.execute(
            address(staticBulkRenewal),
            payment,
            renewData
        );
        assertTrue(ok, "Static bulk renewal failed");

        assertEq(
            smartAccount.totalReceived() - receivedBefore,
            excess,
            "Smart account should receive excess refund from StaticBulkRenewal"
        );
        assertEq(
            balanceBefore - address(smartAccount).balance,
            totalCost,
            "Net cost should equal exact total renewal price"
        );
    }

    // ========================================================================
    // REQUIREMENT 6: NEGATIVE TESTS (REVERTING RECIPIENTS & EXACT PAYMENTS)
    // ========================================================================

    /// @notice 6a: ETHRegistrarController.register() reverts and rolls back when refund recipient reverts
    function test_production_register_revertsWhenRefundFails() public {
        string memory label = "revertuser";
        IETHRegistrarController.Registration memory reg = _createAndCommitRegistration(
            label,
            address(revertingAccount)
        );

        IPriceOracle.Price memory price = controller.rentPrice(
            label,
            REGISTRATION_DURATION
        );
        uint256 totalPrice = price.base + price.premium;
        uint256 payment = totalPrice + 0.5 ether;

        bytes memory registerData = abi.encodeWithSelector(
            controller.register.selector,
            reg
        );

        // Execute from reverting smart account with excess payment -> should revert
        (bool ok, ) = revertingAccount.execute(
            address(controller),
            payment,
            registerData
        );
        assertFalse(ok, "Registration must revert when refund recipient reverts");

        // Rollback verification: Name must NOT be registered
        assertTrue(
            controller.available(label),
            "Name should still be available after rollback"
        );
    }

    /// @notice 6b: ETHRegistrarController.renew() reverts and rolls back when refund recipient reverts
    function test_production_renew_revertsWhenRefundFails() public {
        string memory label = "revertrenew";
        bytes32 labelhash = keccak256(bytes(label));
        baseRegistrar.register(
            uint256(labelhash),
            address(revertingAccount),
            REGISTRATION_DURATION
        );
        uint256 expiryBefore = baseRegistrar.nameExpires(uint256(labelhash));

        IPriceOracle.Price memory price = controller.rentPrice(
            label,
            REGISTRATION_DURATION
        );
        uint256 payment = price.base + 0.3 ether;

        bytes memory renewData = abi.encodeWithSelector(
            controller.renew.selector,
            label,
            REGISTRATION_DURATION,
            bytes32(0)
        );

        (bool ok, ) = revertingAccount.execute(
            address(controller),
            payment,
            renewData
        );
        assertFalse(ok, "Renew must revert when refund recipient reverts");

        // Rollback verification: Expiry remains unchanged
        assertEq(
            baseRegistrar.nameExpires(uint256(labelhash)),
            expiryBefore,
            "Expiry should not change after reverted renewal"
        );
    }

    /// @notice 6c: ETHRegistrarController.withdraw() reverts when contract wallet owner reverts
    function test_production_withdraw_revertsWhenOwnerReverts() public {
        controller.transferOwnership(address(revertingAccount));

        // Fund controller
        string memory label = "fundowner";
        IETHRegistrarController.Registration memory reg = _createAndCommitRegistration(
            label,
            address(this)
        );
        IPriceOracle.Price memory price = controller.rentPrice(
            label,
            REGISTRATION_DURATION
        );
        controller.register{value: price.base + price.premium}(reg);

        uint256 balanceBefore = address(controller).balance;
        assertGt(balanceBefore, 0);

        // Withdraw should revert because owner rejects ETH
        vm.expectRevert();
        controller.withdraw();

        // Controller balance preserved
        assertEq(
            address(controller).balance,
            balanceBefore,
            "Balance should remain untouched on failed withdraw"
        );
    }

    /// @notice 6d: BulkRenewal.renewAll() reverts when recipient reverts
    function test_production_bulkRenewal_revertsWhenRefundFails() public {
        string[] memory names = new string[](1);
        names[0] = "revertbulk";
        baseRegistrar.register(
            uint256(keccak256(bytes(names[0]))),
            address(revertingAccount),
            REGISTRATION_DURATION
        );

        uint256 cost = bulkRenewal.rentPrice(names, REGISTRATION_DURATION);
        uint256 payment = cost + 0.5 ether;

        bytes memory renewData = abi.encodeWithSelector(
            bulkRenewal.renewAll.selector,
            names,
            REGISTRATION_DURATION,
            bytes32(0)
        );

        (bool ok, ) = revertingAccount.execute(
            address(bulkRenewal),
            payment,
            renewData
        );
        assertFalse(ok, "Bulk renewal should revert when refund fails");
    }

    /// @notice 6e: StaticBulkRenewal.renewAll() reverts when recipient reverts
    function test_production_staticBulkRenewal_revertsWhenRefundFails() public {
        string[] memory names = new string[](1);
        names[0] = "revertstatic";
        baseRegistrar.register(
            uint256(keccak256(bytes(names[0]))),
            address(revertingAccount),
            REGISTRATION_DURATION
        );

        uint256 cost = staticBulkRenewal.rentPrice(names, REGISTRATION_DURATION);
        uint256 payment = cost + 0.5 ether;

        bytes memory renewData = abi.encodeWithSelector(
            staticBulkRenewal.renewAll.selector,
            names,
            REGISTRATION_DURATION,
            bytes32(0)
        );

        (bool ok, ) = revertingAccount.execute(
            address(staticBulkRenewal),
            payment,
            renewData
        );
        assertFalse(ok, "Static bulk renewal should revert when refund fails");
    }

    /// @notice 6f: Exact payment in ETHRegistrarController.register() makes NO refund call
    function test_production_register_exactPayment_noRefundCall() public {
        string memory label = "exactreg";
        IETHRegistrarController.Registration memory reg = _createAndCommitRegistration(
            label,
            address(revertingAccount)
        );

        IPriceOracle.Price memory price = controller.rentPrice(
            label,
            REGISTRATION_DURATION
        );
        uint256 exactPrice = price.base + price.premium;

        bytes memory registerData = abi.encodeWithSelector(
            controller.register.selector,
            reg
        );

        // Reverting account sends EXACT amount -> no refund call is triggered -> succeeds!
        (bool ok, ) = revertingAccount.execute(
            address(controller),
            exactPrice,
            registerData
        );
        assertTrue(
            ok,
            "Exact payment registration should succeed even for non-payable recipient"
        );

        bytes32 labelhash = keccak256(bytes(label));
        assertEq(
            baseRegistrar.ownerOf(uint256(labelhash)),
            address(revertingAccount)
        );
    }

    /// @notice 6g: Exact payment in ETHRegistrarController.renew() makes NO refund call
    function test_production_renew_exactPayment_noRefundCall() public {
        string memory label = "exactrenew";
        bytes32 labelhash = keccak256(bytes(label));
        baseRegistrar.register(
            uint256(labelhash),
            address(revertingAccount),
            REGISTRATION_DURATION
        );
        uint256 expiryBefore = baseRegistrar.nameExpires(uint256(labelhash));

        IPriceOracle.Price memory price = controller.rentPrice(
            label,
            REGISTRATION_DURATION
        );

        bytes memory renewData = abi.encodeWithSelector(
            controller.renew.selector,
            label,
            REGISTRATION_DURATION,
            bytes32(0)
        );

        // Reverting account sends EXACT amount -> no refund call is triggered -> succeeds!
        (bool ok, ) = revertingAccount.execute(
            address(controller),
            price.base,
            renewData
        );
        assertTrue(
            ok,
            "Exact payment renewal should succeed even for non-payable recipient"
        );
        assertEq(
            baseRegistrar.nameExpires(uint256(labelhash)) - expiryBefore,
            REGISTRATION_DURATION
        );
    }

    /// @notice 6h: Insufficient payment reverts
    function test_production_register_insufficientPaymentReverts() public {
        string memory label = "shortpay";
        IETHRegistrarController.Registration memory reg = _createAndCommitRegistration(
            label,
            address(smartAccount)
        );

        IPriceOracle.Price memory price = controller.rentPrice(
            label,
            REGISTRATION_DURATION
        );
        uint256 underpayment = (price.base + price.premium) - 1;

        vm.expectRevert(ETHRegistrarController.InsufficientValue.selector);
        controller.register{value: underpayment}(reg);
    }

    // ========================================================================
    // REQUIREMENT 7: REENTRANCY ANALYSIS AND TARGETED TESTS
    // ========================================================================

    /// @notice 7a: Reentering register() during refund with the same commitment must fail
    /// Proves that _consumeCommitment (delete commitments[commitment]) precedes the refund call.
    function test_reentrancy_register_replayCommitmentFails() public {
        string memory label = "reenterreg";
        IETHRegistrarController.Registration memory reg = _createAndCommitRegistration(
            label,
            address(reentrantAccount)
        );

        IPriceOracle.Price memory price = controller.rentPrice(
            label,
            REGISTRATION_DURATION
        );
        uint256 totalPrice = price.base + price.premium;

        // Configure reentrantAccount to attack controller.register() with same reg and value
        bytes memory attackData = abi.encodeWithSelector(
            controller.register.selector,
            reg
        );
        reentrantAccount.setAttack(address(controller), totalPrice, attackData);

        bytes memory startData = abi.encodeWithSelector(
            controller.register.selector,
            reg
        );

        // Call register with excess
        (bool ok, ) = reentrantAccount.execute(
            address(controller),
            totalPrice + 0.5 ether,
            startData
        );
        assertTrue(ok, "Initial registration transaction should succeed");

        // Verify that the reentrant attempt was triggered and failed
        assertTrue(reentrantAccount.attacked(), "Reentrancy hook should have fired");
        assertFalse(
            reentrantAccount.reentrancySucceeded(),
            "Reentrant registration replay must fail due to consumed commitment"
        );
    }

    /// @notice 7b: Reentering withdraw() sees 0 balance and does not drain additional funds
    function test_reentrancy_withdraw_zeroBalanceOnReentry() public {
        ReentrantWithdrawOwner reentrantOwner = new ReentrantWithdrawOwner(
            controller
        );
        controller.transferOwnership(address(reentrantOwner));

        // Fund controller
        string memory label = "withdrawreenter";
        IETHRegistrarController.Registration memory reg = _createAndCommitRegistration(
            label,
            address(this)
        );
        IPriceOracle.Price memory price = controller.rentPrice(
            label,
            REGISTRATION_DURATION
        );
        controller.register{value: price.base + price.premium}(reg);

        uint256 fundAmount = address(controller).balance;
        assertGt(fundAmount, 0);

        // Execute withdraw
        controller.withdraw();

        assertTrue(reentrantOwner.reentered(), "Owner should have reentered");
        assertEq(
            reentrantOwner.reenteredBalanceSeen(),
            0,
            "Controller balance must already be 0 when reentering withdraw"
        );
        assertEq(
            address(reentrantOwner).balance,
            fundAmount,
            "Reentrant owner should receive exactly the initial balance"
        );
        assertEq(
            address(controller).balance,
            0,
            "Controller balance should remain 0"
        );
    }

    /// @notice 7c: Reentering BulkRenewal.renewAll() sees 0 balance in BulkRenewal
    function test_reentrancy_bulkRenewal_zeroBalanceOnReentry() public {
        string[] memory names = new string[](1);
        names[0] = "reenterbulk";
        baseRegistrar.register(
            uint256(keccak256(bytes(names[0]))),
            address(reentrantAccount),
            REGISTRATION_DURATION
        );

        uint256 cost = bulkRenewal.rentPrice(names, REGISTRATION_DURATION);

        // Attempt reentrant call to renewAll with empty array (trying to harvest leftover balance)
        string[] memory emptyNames = new string[](0);
        bytes memory attackData = abi.encodeWithSelector(
            bulkRenewal.renewAll.selector,
            emptyNames,
            0,
            bytes32(0)
        );
        reentrantAccount.setAttack(address(bulkRenewal), 0, attackData);

        bytes memory startData = abi.encodeWithSelector(
            bulkRenewal.renewAll.selector,
            names,
            REGISTRATION_DURATION,
            bytes32(0)
        );

        (bool ok, ) = reentrantAccount.execute(
            address(bulkRenewal),
            cost + 1 ether,
            startData
        );
        assertTrue(ok, "Bulk renewal should succeed");
        assertTrue(reentrantAccount.attacked(), "Reentrancy should be attempted");
        // Reentrant call saw 0 balance in BulkRenewal, so 0 ETH was refunded in reentrancy
        assertEq(
            address(bulkRenewal).balance,
            0,
            "BulkRenewal balance must be 0"
        );
    }

    /// @notice 7d: Reentering StaticBulkRenewal.renewAll() sees 0 balance in StaticBulkRenewal
    function test_reentrancy_staticBulkRenewal_zeroBalanceOnReentry() public {
        string[] memory names = new string[](1);
        names[0] = "reenterstatic";
        baseRegistrar.register(
            uint256(keccak256(bytes(names[0]))),
            address(reentrantAccount),
            REGISTRATION_DURATION
        );

        uint256 cost = staticBulkRenewal.rentPrice(names, REGISTRATION_DURATION);

        string[] memory emptyNames = new string[](0);
        bytes memory attackData = abi.encodeWithSelector(
            staticBulkRenewal.renewAll.selector,
            emptyNames,
            0,
            bytes32(0)
        );
        reentrantAccount.setAttack(address(staticBulkRenewal), 0, attackData);

        bytes memory startData = abi.encodeWithSelector(
            staticBulkRenewal.renewAll.selector,
            names,
            REGISTRATION_DURATION,
            bytes32(0)
        );

        (bool ok, ) = reentrantAccount.execute(
            address(staticBulkRenewal),
            cost + 1 ether,
            startData
        );
        assertTrue(ok, "Static bulk renewal should succeed");
        assertTrue(reentrantAccount.attacked(), "Reentrancy should be attempted");
        assertEq(
            address(staticBulkRenewal).balance,
            0,
            "StaticBulkRenewal balance must be 0"
        );
    }

    /// @notice 7e: Reentering renew() during refund is safe under CEI
    function test_reentrancy_renew_safeCEI() public {
        string memory label = "reenterrenew";
        bytes32 labelhash = keccak256(bytes(label));
        baseRegistrar.register(
            uint256(labelhash),
            address(reentrantAccount),
            REGISTRATION_DURATION
        );
        uint256 expiryInitial = baseRegistrar.nameExpires(uint256(labelhash));

        IPriceOracle.Price memory price = controller.rentPrice(
            label,
            REGISTRATION_DURATION
        );

        // Configure attack: try to reenter renew with insufficient funds (0 value)
        bytes memory attackData = abi.encodeWithSelector(
            controller.renew.selector,
            label,
            REGISTRATION_DURATION,
            bytes32(0)
        );
        reentrantAccount.setAttack(address(controller), 0, attackData);

        bytes memory renewData = abi.encodeWithSelector(
            controller.renew.selector,
            label,
            REGISTRATION_DURATION,
            bytes32(0)
        );

        // Execute renew with excess payment
        (bool ok, ) = reentrantAccount.execute(
            address(controller),
            price.base + 0.5 ether,
            renewData
        );
        assertTrue(ok, "Initial renewal should succeed");
        assertTrue(reentrantAccount.attacked(), "Reentrancy hook should have fired");
        // Reentrant call with 0 value should fail because price.base > 0
        assertFalse(
            reentrantAccount.reentrancySucceeded(),
            "Reentrant renewal with 0 value must fail"
        );

        // Verify base expiry was extended by exactly 1 duration
        uint256 expiryFinal = baseRegistrar.nameExpires(uint256(labelhash));
        assertEq(
            expiryFinal - expiryInitial,
            REGISTRATION_DURATION,
            "Expiry should reflect exactly one legitimate renewal"
        );
    }

    /// @notice 8a: Verify low-level call failures are NEVER silently ignored across all functions
    function test_production_refundsNotSilentlyIgnored() public {
        // 1. register: excess with reverting sender reverts entire call
        string memory regLabel = "nosilentreg";
        IETHRegistrarController.Registration memory reg = _createAndCommitRegistration(
            regLabel,
            address(revertingAccount)
        );
        IPriceOracle.Price memory regPrice = controller.rentPrice(
            regLabel,
            REGISTRATION_DURATION
        );
        bytes memory regData = abi.encodeWithSelector(
            controller.register.selector,
            reg
        );
        (bool regOk, ) = revertingAccount.execute(
            address(controller),
            regPrice.base + regPrice.premium + 1 ether,
            regData
        );
        assertFalse(regOk, "register() refund failure must NOT be silently ignored");

        // 2. renew: excess with reverting sender reverts entire call
        string memory renewLabel = "nosilentrenew";
        bytes32 renewLabelhash = keccak256(bytes(renewLabel));
        baseRegistrar.register(
            uint256(renewLabelhash),
            address(revertingAccount),
            REGISTRATION_DURATION
        );
        IPriceOracle.Price memory renewPrice = controller.rentPrice(
            renewLabel,
            REGISTRATION_DURATION
        );
        bytes memory renewData = abi.encodeWithSelector(
            controller.renew.selector,
            renewLabel,
            REGISTRATION_DURATION,
            bytes32(0)
        );
        (bool renewOk, ) = revertingAccount.execute(
            address(controller),
            renewPrice.base + 1 ether,
            renewData
        );
        assertFalse(renewOk, "renew() refund failure must NOT be silently ignored");

        // 3. BulkRenewal: excess with reverting sender reverts entire call
        string[] memory bulkNames = new string[](1);
        bulkNames[0] = "nosilentbulk";
        baseRegistrar.register(
            uint256(keccak256(bytes(bulkNames[0]))),
            address(revertingAccount),
            REGISTRATION_DURATION
        );
        uint256 bulkCost = bulkRenewal.rentPrice(bulkNames, REGISTRATION_DURATION);
        bytes memory bulkData = abi.encodeWithSelector(
            bulkRenewal.renewAll.selector,
            bulkNames,
            REGISTRATION_DURATION,
            bytes32(0)
        );
        (bool bulkOk, ) = revertingAccount.execute(
            address(bulkRenewal),
            bulkCost + 1 ether,
            bulkData
        );
        assertFalse(bulkOk, "BulkRenewal refund failure must NOT be silently ignored");

        // 4. StaticBulkRenewal: excess with reverting sender reverts entire call
        string[] memory staticNames = new string[](1);
        staticNames[0] = "nosilentstatic";
        baseRegistrar.register(
            uint256(keccak256(bytes(staticNames[0]))),
            address(revertingAccount),
            REGISTRATION_DURATION
        );
        uint256 staticCost = staticBulkRenewal.rentPrice(staticNames, REGISTRATION_DURATION);
        bytes memory staticData = abi.encodeWithSelector(
            staticBulkRenewal.renewAll.selector,
            staticNames,
            REGISTRATION_DURATION,
            bytes32(0)
        );
        (bool staticOk, ) = revertingAccount.execute(
            address(staticBulkRenewal),
            staticCost + 1 ether,
            staticData
        );
        assertFalse(staticOk, "StaticBulkRenewal refund failure must NOT be silently ignored");
    }
}
