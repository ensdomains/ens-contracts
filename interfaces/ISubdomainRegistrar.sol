pragma solidity >=0.6.0 <0.8.0;
pragma experimental ABIEncoderV2;

interface ISubdomainRegistrar {
    event OwnerChanged(
        bytes32 indexed label,
        address indexed oldOwner,
        address indexed newOwner
    );
    event DomainConfigured(bytes32 indexed label);
    event DomainUnlisted(bytes32 indexed label);
    event NewRegistration(
        bytes32 indexed label,
        string subdomain,
        address indexed owner,
        address indexed referrer,
        uint256 price
    );
    event RentPaid(
        bytes32 indexed label,
        string subdomain,
        uint256 amount,
        uint256 expirationDate
    );

    // InterfaceID of these four methods is 0xc1b15f5a
    // function query(bytes32 label, string calldata subdomain)
    //     external
    //     view
    //     returns (
    //         string memory domain,
    //         uint256 signupFee,
    //         uint256 rent,
    //         uint256 referralFeePPM
    //     );

    function register(
        bytes32 label,
        string calldata subdomain,
        address owner,
        address payable referrer,
        address resolver,
        bytes[] calldata data
    ) external virtual payable;
}
