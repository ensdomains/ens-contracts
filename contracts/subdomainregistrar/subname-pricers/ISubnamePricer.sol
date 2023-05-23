interface ISubnamePricer {
    function price(
        bytes32 parentNode,
        string calldata label,
        uint256 duration
    ) external view returns (address token, uint256 price);
}
