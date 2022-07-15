pragma solidity >=0.8.4;

contract DummyOracle {
    int256 value;

    constructor(int256 _value) public {
        set(_value);
    }

    function set(int256 _value) public {
        value = _value;
    }

    function latestAnswer() public view returns (int256) {
        return value;
    }
}
