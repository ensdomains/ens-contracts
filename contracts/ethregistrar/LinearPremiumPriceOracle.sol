pragma solidity >=0.8.4;

import "./StablePriceOracle.sol";
import "./ILinearPremiumPriceOracle.sol";

contract LinearPremiumPriceOracle is
    StablePriceOracle,
    ILinearPremiumPriceOracle
{
    uint256 constant GRACE_PERIOD = 90 days;

    uint256 public immutable initialPremium;
    uint256 public immutable premiumDecreaseRate;

    constructor(
        AggregatorInterface _usdOracle,
        uint256[] memory _rentPrices,
        uint256 _initialPremium,
        uint256 _premiumDecreaseRate
    ) public StablePriceOracle(_usdOracle, _rentPrices) {
        initialPremium = _initialPremium;
        premiumDecreaseRate = _premiumDecreaseRate;
    }

    function _premium(
        string memory name,
        uint256 expires,
        uint256 /*duration*/
    ) internal view override returns (uint256) {
        expires = expires + GRACE_PERIOD;
        if (expires > block.timestamp) {
            // No premium for renewals
            return 0;
        }

        // Calculate the discount off the maximum premium
        uint256 discount = premiumDecreaseRate * (block.timestamp - expires);

        // If we've run out the premium period, return 0.
        if (discount > initialPremium) {
            return 0;
        }

        return initialPremium - discount;
    }

    /**
     * @dev Returns the timestamp at which a name with the specified expiry date will have
     *      the specified re-registration price premium.
     * @param expires The timestamp at which the name expires.
     * @param amount The amount, in wei, the caller is willing to pay
     * @return The timestamp at which the premium for this domain will be `amount`.
     */
    function timeUntilPremium(uint256 expires, uint256 amount)
        external
        view
        override
        returns (uint256)
    {
        amount = weiToAttoUSD(amount);
        require(amount <= initialPremium);

        expires = expires + GRACE_PERIOD;

        uint256 discount = initialPremium - amount;
        uint256 duration = discount / premiumDecreaseRate;
        return expires + duration;
    }

    function supportsInterface(bytes4 interfaceID)
        public
        view
        virtual
        override
        returns (bool)
    {
        return
            (interfaceID == type(ILinearPremiumPriceOracle).interfaceId) ||
            super.supportsInterface(interfaceID);
    }
}
