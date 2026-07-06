//SPDX-License-Identifier: MIT
pragma solidity >=0.8.17 <0.9.0;

import {Ownable} from "https://raw.githubusercontent.com/OpenZeppelin/openzeppelin-contracts/v5.0.2/contracts/access/Ownable.sol";
import {IPriceOracle} from "./IPriceOracle.sol";
import {StringUtils} from "../utils/StringUtils.sol";

/// @notice Fixed, owner-adjustable ETN-denominated pricing oracle for name registration.
/// @dev Prices are set directly in ETN (wei), NOT derived from a live USD feed.
///      Defaults below are illustrative starting points based on ETN's spot price
///      at time of writing (~$0.0009 USD, highly volatile) and should be revisited
///      periodically by the owner via setPrices().
contract StablePriceOracle is IPriceOracle, Ownable {
    using StringUtils for *;

    // Annual price per tier, in wei (ETN has 18 decimals like ETH).
    // price1Letter unused (1-2 char names blocked via controller's `valid()` check,
    // included here only so array indices align with label length).
    uint256 public price1Letter;
    uint256 public price2Letter;
    uint256 public price3Letter;
    uint256 public price4Letter;
    uint256 public price5Letter; // 5+ characters

    // Optional premium for recently-expired names, decaying linearly over `premiumDecayPeriod`.
    uint256 public startPremium;
    uint256 public premiumDecayPeriod = 21 days;

    event PricesUpdated(uint256[] prices);
    event PremiumUpdated(uint256 startPremium, uint256 decayPeriod);

    constructor() Ownable(msg.sender) {
        // ~$640/yr @ ~$0.0009/ETN
        price3Letter = 711_111 ether;
        // ~$160/yr
        price4Letter = 177_778 ether;
        // ~$5/yr
        price5Letter = 5_556 ether;

        // 1-2 letter tiers set high/blocking by default since these are
        // typically disallowed at the controller level anyway (valid() check).
        price1Letter = price3Letter * 10;
        price2Letter = price3Letter * 5;

        // No expiry premium by default — enable via setPremium() if desired.
        startPremium = 0;
    }

    /// @notice Update per-length-tier annual prices, in wei.
    /// @param prices [1-letter, 2-letter, 3-letter, 4-letter, 5+letter]
    function setPrices(uint256[5] calldata prices) external onlyOwner {
        price1Letter = prices[0];
        price2Letter = prices[1];
        price3Letter = prices[2];
        price4Letter = prices[3];
        price5Letter = prices[4];

        uint256[] memory p = new uint256[](5);
        for (uint256 i; i < 5; i++) p[i] = prices[i];
        emit PricesUpdated(p);
    }

    /// @notice Update the recently-expired-name premium curve.
    /// @param _startPremium Premium (in wei) charged immediately after expiry.
    /// @param _decayPeriod  Time over which the premium linearly decays to 0.
    function setPremium(
        uint256 _startPremium,
        uint256 _decayPeriod
    ) external onlyOwner {
        startPremium = _startPremium;
        premiumDecayPeriod = _decayPeriod;
        emit PremiumUpdated(_startPremium, _decayPeriod);
    }

    /// @inheritdoc IPriceOracle
    function price(
        string calldata name,
        uint256 expires,
        uint256 duration
    ) external view override returns (IPriceOracle.Price memory) {
        uint256 len = name.strlen();
        uint256 annualPrice = _annualPrice(len);
        uint256 basePrice = (annualPrice * duration) / 365 days;

        uint256 premium = _premium(expires);

        return IPriceOracle.Price({base: basePrice, premium: premium});
    }

    function _annualPrice(uint256 len) internal view returns (uint256) {
        if (len >= 5) return price5Letter;
        if (len == 4) return price4Letter;
        if (len == 3) return price3Letter;
        if (len == 2) return price2Letter;
        return price1Letter;
    }

    /// @dev Linear decay from startPremium to 0 over premiumDecayPeriod,
    ///      starting from the moment the name entered its grace period (i.e. `expires`).
    function _premium(uint256 expires) internal view returns (uint256) {
        if (startPremium == 0 || expires == 0 || block.timestamp < expires) {
            return 0;
        }
        uint256 elapsed = block.timestamp - expires;
        if (elapsed >= premiumDecayPeriod) {
            return 0;
        }
        return startPremium - (startPremium * elapsed) / premiumDecayPeriod;
    }
}