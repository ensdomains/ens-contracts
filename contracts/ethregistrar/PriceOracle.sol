pragma solidity >=0.8.4;

struct Cost {
    uint256 base;
    uint256 premium;
}

interface PriceOracle {
    /**
     * @dev Returns the price to register or renew a name.
     * @param name The name being registered or renewed.
     * @param expires When the name presently expires (0 if this is a new registration).
     * @param duration How long the name is being registered or extended for, in seconds.
     * @return cost The price of this renewal or registration, in wei.
     */
    function price(
        string calldata name,
        uint256 expires,
        uint256 duration
    ) external view returns (Cost calldata cost);

    function duration(
        string calldata name,
        uint256 expires,
        uint256 value
    ) external view returns (uint256);
}
