// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface IReverseRegistrarStub {
    function setName(string memory name) external;
}

/// @notice https://docs.ens.domains/ensip/19/
library ReverseNamer {
    address constant REVERSE_REGISTRAR_MAINNET = address(0); // TODO: ENSv2 addr.reverse registrar
    address constant REVERSE_REGISTRAR_MAINNET_ROLLUP =
        0x0000000000D8e504002cC26E3Ec46D81971C1664;
    address constant REVERSE_REGISTRAR_TESTNET_ROLLUP =
        0x00000BeEF055f7934784D6d81b6BC86665630dbA;

    function registrarFromChain(
        uint256 chainId
    ) internal pure returns (address) {
        if (isMainnet(chainId)) {
            return REVERSE_REGISTRAR_MAINNET;
        } else if (isMainnetRollup(chainId)) {
            return REVERSE_REGISTRAR_MAINNET_ROLLUP;
        } else if (isTestnetRollup(chainId)) {
            return REVERSE_REGISTRAR_TESTNET_ROLLUP;
        } else {
            return address(0);
        }
    }

    function setName(string memory primary) internal {
        address registrar = registrarFromChain(block.chainid);
        if (registrar != address(0)) {
            IReverseRegistrarStub(registrar).setName(primary);
        }
    }

    function isMainnet(uint256 chainId) internal pure returns (bool) {
        return
            chainId == 1 || // mainnet
            chainId == 17000 || // holesky
            chainId == 560048 || // hoodi
            chainId == 11155111; // sepolia
    }

    function isMainnetRollup(uint256 chainId) internal pure returns (bool) {
        return
            chainId == 10 || // optimism
            chainId == 8453 || // base
            chainId == 42161 || // arb1
            chainId == 59144 || // linea
            chainId == 534352; // scroll
    }

    function isTestnetRollup(uint256 chainId) internal pure returns (bool) {
        return
            chainId == 59141 || // linea-sepolia
            chainId == 84532 || // base-sepolia
            chainId == 421614 || // arb1-sepolia
            chainId == 534351 || // scroll-sepolia
            chainId == 11155420; // optimism-sepolia
    }
}

/// @dev Compile-time guard to prevent being Ownable.
contract NotOwnable {
    function owner() internal pure {}
}

/// @notice Mixin for naming a contract once.
contract NamedOnce is NotOwnable {
    constructor(string memory primary) {
        ReverseNamer.setName(primary);
    }
}

/// @notice Mixin for delegated contract naming.
contract NameableBy is NotOwnable {
    address public nameOwner;

    constructor(address owner, string memory primary) {
        nameOwner = owner;
        if (bytes(primary).length > 0) {
            ReverseNamer.setName(primary);
        }
    }

    /// @notice Change the namer.
    /// @dev Use `address(0)` to revoke.
    function setNameOwner(address owner) public {
        require(msg.sender == nameOwner);
        nameOwner = owner;
    }

    /// @notice Set contract primary name.
    function setName(string memory primary) public {
        require(msg.sender == nameOwner);
        ReverseNamer.setName(primary);
    }
}
