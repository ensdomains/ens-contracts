//SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "./INameWrapper.sol";
import "./Controllable.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Create2} from "@openzeppelin/contracts/utils/Create2.sol";
import {Address} from "@openzeppelin/contracts/utils/Address.sol";

/**
 * @dev A proxy contract that wraps new name wrapper controllers to ensure they don't shorten the duration of registrations.
 */
contract NameWrapperControllerProxy {
    address public immutable controller;
    INameWrapper public immutable wrapper;

    constructor(address _controller, INameWrapper _wrapper) {
        controller = _controller;
        wrapper = _wrapper;
    }

    /**
     * @dev Registers a new .eth second-level domain and wraps it.
     *      Only callable by authorised controllers.
     * @param label The label to register (Eg, 'foo' for 'foo.eth').
     * @param wrappedOwner The owner of the wrapped name.
     * @param duration The duration, in seconds, to register the name for.
     * @param resolver The resolver address to set on the ENS registry (optional).
     * @param ownerControlledFuses Initial owner-controlled fuses to set
     * @return registrarExpiry The expiry date of the new name on the .eth registrar, in seconds since the Unix epoch.
     */
    function registerAndWrapETH2LD(
        string calldata label,
        address wrappedOwner,
        uint256 duration,
        address resolver,
        uint16 ownerControlledFuses
    ) external returns (uint256 registrarExpiry) {
        require(msg.sender == controller);
        require(duration < 365000000 days);
        return
            wrapper.registerAndWrapETH2LD(
                label,
                wrappedOwner,
                duration,
                resolver,
                ownerControlledFuses
            );
    }

    /**
     * @notice Renews a .eth second-level domain.
     * @dev Only callable by authorised controllers.
     * @param tokenId The hash of the label to register (eg, `keccak256('foo')`, for 'foo.eth').
     * @param duration The number of seconds to renew the name for.
     * @return expires The expiry date of the name on the .eth registrar, in seconds since the Unix epoch.
     */
    function renew(
        uint256 tokenId,
        uint256 duration
    ) external returns (uint256 expires) {
        require(msg.sender == controller);
        require(duration < 365000000 days);
        return wrapper.renew(tokenId, duration);
    }
}

/**
 * @dev Contract to act as the owner of the NameWrapper, permitting its owner to make certain changes with additional checks.
 *      This was implemented in response to a vulnerability disclosure that would permit the DAO to appoint a malicious controller
 *      that shortens the registration period of affected ENS names. This contract exists to prevent that from happening.
 */
contract NameWrapperAdmin is Ownable {
    using Address for address;

    address public immutable wrapper;

    constructor(address _wrapper) {
        wrapper = _wrapper;
    }

    /**
     * @dev Deploys a controller proxy for the given controller, if one does not already exist.
     *      Anyone can call this function, but the proxy will only function if added by an authorized
     *      caller using `addController`.
     * @param controller The controller contract to create a proxy for.
     * @return The address of the controller proxy.
     */
    function deployControllerProxy(
        address controller
    ) external returns (address) {
        address proxyAddress = getProxyAddress(controller);
        if (!proxyAddress.isContract()) {
            new NameWrapperControllerProxy{salt: bytes32(0)}(
                controller,
                INameWrapper(wrapper)
            );
        }
        return proxyAddress;
    }

    /**
     * @dev Authorizes a controller proxy to register and renew names on the wrapper.
     * @param controller The controller contract to authorize.
     */
    function addController(address controller) external onlyOwner {
        Controllable(wrapper).setController(getProxyAddress(controller), true);
    }

    /**
     * @dev Deauthorizes a controller proxy.
     * @param controller The controller contract to deauthorize.
     */
    function removeController(address controller) external onlyOwner {
        Controllable(wrapper).setController(getProxyAddress(controller), false);
    }

    /**
     * @dev Gets the address of the proxy contract for a given controller.
     * @param controller The controller contract to get the proxy address for.
     * @return The address of the proxy contract.
     */
    function getProxyAddress(address controller) public view returns (address) {
        return
            Create2.computeAddress(
                bytes32(0),
                keccak256(
                    abi.encodePacked(
                        type(NameWrapperControllerProxy).creationCode,
                        controller,
                        wrapper
                    )
                )
            );
    }

    /**
     * @notice Set the metadata service. Only the owner can do this
     * @param _metadataService The new metadata service
     */
    function setMetadataService(
        IMetadataService _metadataService
    ) public onlyOwner {
        INameWrapper(wrapper).setMetadataService(_metadataService);
    }

    /**
     * @notice Set the address of the upgradeContract of the contract. only admin can do this
     * @dev The default value of upgradeContract is the 0 address. Use the 0 address at any time
     * to make the contract not upgradable.
     * @param _upgradeAddress address of an upgraded contract
     */
    function setUpgradeContract(
        INameWrapperUpgrade _upgradeAddress
    ) public onlyOwner {
        INameWrapper(wrapper).setUpgradeContract(_upgradeAddress);
    }
}
