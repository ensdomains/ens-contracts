pragma solidity >=0.8.4;

interface PriceOracle {
    /**
     * @dev Returns the price to register or renew a name.
     * @param name The name being registered or renewed.
     * @param expires When the name presently expires (0 if this is a new registration).
     * @param duration How long the name is being registered or extended for, in seconds.
     * @return base premium Cost tuple of base price + premium price
     */
    function price(
        string calldata name,
        uint256 expires,
        uint256 duration
    ) external view returns (uint256 base, uint256 premium);

    function duration(
        string calldata name,
        uint256 expires,
        uint256 value
    ) external view returns (uint256 duration, uint256 premium);
}
