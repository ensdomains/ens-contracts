// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

/// @notice Interface for the reverse registrar
interface IReverseRegistrar {
    /// @notice Emitted when a reverse record is claimed.
    /// @param addr The address that the reverse record is claimed for
    /// @param node The ENS node hash of the reverse record
    event ReverseClaimed(address indexed addr, bytes32 indexed node);

    /// @notice Emitted when the default resolver is changed.
    /// @param resolver The resolver that was set
    event DefaultResolverChanged(address indexed resolver);

    /// @notice Thrown when the caller is not authorised to perform the action
    error Unauthorised();

    /// @notice Thrown when the resolver address is zero
    error ResolverAddressZero();

    /// @notice Sets the default resolver
    /// @param resolver The resolver to set
    function setDefaultResolver(address resolver) external;

    /// @notice Transfers ownership of the reverse ENS record associated with the
    ///         calling account.
    /// @param owner The address to set as the owner of the reverse record in ENS.
    /// @return The ENS node hash of the reverse record
    function claim(address owner) external returns (bytes32);

    /// @notice Transfers ownership of the reverse ENS record associated with the
    ///         addr provided account.
    /// @param addr The address to claim the reverse record for
    /// @param owner The address to set as the owner of the reverse record
    /// @param resolver The resolver of the reverse node
    /// @return The ENS node hash of the reverse record
    function claimForAddr(
        address addr,
        address owner,
        address resolver
    ) external returns (bytes32);

    /// @notice Transfers ownership of the reverse ENS record associated with the
    ///         addr provided account using a signature to authorise.
    /// @param addr The address to claim the reverse record for
    /// @param owner The address to set as the owner of the reverse record
    /// @param resolver The resolver of the reverse node
    /// @param signatureExpiry The expiry of the signature
    /// @param signature The signature to authorise the claim
    /// @return The ENS node hash of the reverse record
    function claimForAddrWithSignature(
        address addr,
        address owner,
        address resolver,
        uint256 signatureExpiry,
        bytes calldata signature
    ) external returns (bytes32);

    /// @notice Transfers ownership of the reverse ENS record associated with the
    ///         calling account.
    /// @param owner The address to set as the owner of the reverse record
    /// @param resolver The resolver of the reverse node
    /// @return The ENS node hash of the reverse record
    function claimWithResolver(
        address owner,
        address resolver
    ) external returns (bytes32);

    /// @notice Sets the `name()` record for the reverse ENS record associated
    ///         with the calling account, and updates the resolver to the
    ///         default reverse resolver.
    /// @param name The name to set for the calling account
    /// @return The ENS node hash of the reverse record
    function setName(string memory name) external returns (bytes32);

    /// @notice Sets the `name()` record for the reverse ENS record associated
    ///         with the addr provided account, and updates the resolver to the
    ///         resolver provided.
    /// @param addr The reverse record to set
    /// @param owner The owner of the reverse node
    /// @param resolver The resolver of the reverse node
    /// @param name The name to set for the provided address
    /// @return The ENS node hash of the reverse record
    function setNameForAddr(
        address addr,
        address owner,
        address resolver,
        string memory name
    ) external returns (bytes32);

    /// @notice Sets the `name()` record for the reverse ENS record associated
    ///         with the addr provided account using a signature to authorise,
    ///         and updates the resolver to the resolver provided.
    /// @param addr The reverse record to set
    /// @param owner The owner of the reverse node
    /// @param resolver The resolver of the reverse node
    /// @param signatureExpiry The expiry of the signature
    /// @param signature The signature to authorise the claim
    /// @param name The name to set for the provided address
    /// @return The ENS node hash of the reverse record
    function setNameForAddrWithSignature(
        address addr,
        address owner,
        address resolver,
        uint256 signatureExpiry,
        bytes calldata signature,
        string memory name
    ) external returns (bytes32);

    /// @notice Returns the ENS node hash for the reverse record associated with
    ///         the addr provided account.
    /// @param addr The address to get the reverse node hash for
    /// @return The ENS node hash
    function node(address addr) external pure returns (bytes32);
}
