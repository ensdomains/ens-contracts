//SPDX-License-Identifier: MIT
pragma solidity ~0.8.17;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ERC165} from "@openzeppelin/contracts/utils/introspection/ERC165.sol";
import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import {ERC20Recoverable} from "../utils/ERC20Recoverable.sol";
import {IBaseRegistrar} from "./BaseRegistrarImplementation.sol";
import {IETHRegistrarController} from "./IETHRegistrarController.sol";
import {INameWrapper} from "../wrapper/INameWrapper.sol";
import {IPriceOracle} from "./IPriceOracle.sol";

interface IETHReferredRenewalProxy {
    function renewWrapped(
        string calldata label,
        uint256 duration,
        bytes32 referrer
    ) external payable;

    function renew(
        string calldata label,
        uint256 duration,
        bytes32 referrer
    ) external payable;
}

/// @dev Proxy supporting referred renewals for direct subnames of .eth
/// NOTE: is Ownable for the goal of supporting setting a primary ENS name
///        for this contract in alignment with the upcoming “ENS contract
///        naming season”. Depending on how this contract is ultimately
///        deployed we can set this to the address currently associated with
///        enslabs.eth or namehashlabs.eth.
///        See: https://www.enscribe.xyz/docs/introduction/naming-contracts#option-3-make-the-contract-ownable-recommended
/// TODO: Please remove is ERC165 if not relevant.
/// TODO: Please review is ERC20Recoverable. Assumption is this is nice in case someone
///       sends tokens incorrectly?
contract ETHReferredRenewalProxy is Ownable, ERC165, ERC20Recoverable {
    /// @notice The "unwrapped" ETHRegistrarController
    IETHRegistrarController public immutable unwrappedEthRegistrarController;

    /// @notice The "wrapped" ETHRegistrarController
    /// TODO: WARNING: This is NOT the correct interface for the "wrapped"
    ///     ETHRegistrarController.
    /// TODO: What's the best way to import this? It seems the "wrapped"
    ///     ETHRegistrarController was removed from the ens-contracts repo?
    ///     Do we need to add it back?
    /// See: https://etherscan.io/address/0x253553366da8546fc250f225fe3d25d0c782303b#code
    IETHRegistrarController public immutable wrappedEthRegistrarController;

    /// @notice The base registrar implementation for the eth TLD.
    IBaseRegistrar public immutable baseRegistrar;

    /// @notice The NameWrapper.
    INameWrapper public immutable nameWrapper;

    /// @notice Emitted when a wrapped name is renewed.
    /// @dev matches the NameRenewed event from the “unwrapped” ETHRegistrarController
    ///
    /// @param label The childmost label of the direct subname of .eth.
    /// @param labelhash The keccak256 hash of the label.
    /// @param cost The cost of the renewal.
    /// @param expires The expiry time of the name after the renewal.
    /// @param referrer The referrer of the renewal.
    event NameRenewed(
        string label,
        bytes32 indexed labelhash,
        uint256 cost,
        uint256 expires,
        bytes32 referrer
    );

    /// @notice Constructor for the ETHReferredRenewalProxy
    ///
    /// @param _unwrappedEthRegistrarController The (unwrapped) ETHRegistrarController.
    /// @param _wrappedEthRegistrarController The (wrapped) ETHRegistrarController.
    /// @param _nameWrapper The NameWrapper.
    /// @param _baseRegistrar The ETH BaseRegistrarImplementation..
    constructor(
        IETHRegistrarController _unwrappedEthRegistrarController,
        IETHRegistrarController _wrappedEthRegistrarController,
        INameWrapper _nameWrapper,
        IBaseRegistrar _baseRegistrar
    ) {
        unwrappedEthRegistrarController = _unwrappedEthRegistrarController;
        wrappedEthRegistrarController = _wrappedEthRegistrarController;
        nameWrapper = _nameWrapper;
        baseRegistrar = _baseRegistrar;
    }

    /// @notice Identifies if the direct subname of .eth with the provided
    ///         labelhash is wrapped.
    ///
    /// @param labelhash The labelhash of the direct subname of .eth.
    /// @return true if and only if the direct subname of .eth with the associated
    ///              labelhash is wrapped.
    function isWrapped(bytes32 labelhash) external view returns (bool) {
        try baseRegistrar.ownerOf(uint256(labelhash)) returns (address owner) {
            return owner == address(nameWrapper);
        } catch {
            // ownership has expired
            return false;
        }
    }

    /// @notice Renews a direct subname of .eth.
    /// @dev Matches related function signature of the (unwrapped) ETHRegistrarController.
    ///
    /// @param label The label of the actively registered direct subname of .eth.
    /// @param duration The duration of the renewal in seconds.
    /// @param referrer The referrer of the renewal.
    function renew(
        string calldata label,
        uint256 duration,
        bytes32 referrer
    ) external payable {
        bytes32 labelhash = keccak256(bytes(label));

        if (this.isWrapped(labelhash)) {
            IPriceOracle.Price memory price = wrappedEthRegistrarController
                .rentPrice(label, duration);
            // NOTE: the wrappedEthRegistrarController uses the price oracle at
            //       https://etherscan.io/address/0x7542565191d074cE84fBfA92cAE13AcB84788CA9#code
            //       and this assigned price oracle cannot be changed. For this price
            //       oracle, price.premium can only be non-zero if a name is expired and is
            //       recently released. Note also that a name that is wrapped cannot
            //       be expired. Therefore, since we have already verified that this name is
            //       wrapped, it is guaranteed that price.premium is 0 and we only need to
            //       consider price.base which is exclusively a function of the length of the
            //       label.

            // unfortunately, wrappedEthRegistrarController.renew does not
            // return the new expiry time. Therefore we must calculate it ourselves.
            uint256 previousExpiry = baseRegistrar.nameExpires(
                uint256(labelhash)
            );

            // TODO: please review for any overflow issues.
            uint256 newExpiry = previousExpiry + duration;

            // TODO: See related TODO up above for how the interface for the
            //       wrappedEthRegistrarController is currently wrong and needs
            //       to be fixed. Once fixed, this call should be correct.
            wrappedEthRegistrarController.renew(label, duration);

            emit NameRenewed(label, labelhash, price.base, newExpiry, referrer);
        } else {
            unwrappedEthRegistrarController.renew(label, duration, referrer);
        }

        // TODO: Should we (forward?) the refund of any surplus funds that
        //       were not consumed in the renewal? I'm concerned that the
        //       refund operation the downstream contracts refund back to this
        //       proxy and not back to the caller of this function.
    }

    /// @notice Withdraws the balance of the contract to the owner.
    function withdraw() public {
        payable(owner()).transfer(address(this).balance);
    }

    /// @inheritdoc IERC165
    function supportsInterface(
        bytes4 interfaceID
    ) public view override returns (bool) {
        return
            interfaceID == type(IETHReferredRenewalProxy).interfaceId ||
            super.supportsInterface(interfaceID);
    }
}
