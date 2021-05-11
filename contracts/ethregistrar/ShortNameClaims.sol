pragma solidity ^0.5.0;

import "./BaseRegistrar.sol";
import "./StringUtils.sol";
import "./PriceOracle.sol";

import "@ensdomains/buffer/contracts/Buffer.sol";
import "@ensdomains/dnssec-oracle/contracts/BytesUtils.sol";
import "openzeppelin-solidity/contracts/access/Roles.sol";

/**
 * @dev ShortNameClaims is a contract that permits people to register claims
 *      for short (3-6 character) ENS names ahead of the auction process.
 *
 *      Anyone with a DNS name registered before January 1, 2019, may use this
 *      name to support a claim for a matching ENS name. In the event that
 *      multiple claimants request the same name, the name will be assigned to
 *      the oldest registered DNS name.
 *
 *      Claims may be submitted by calling `submitExactClaim`,
 *      `submitCombinedClaim` or `submitPrefixClaim` as appropriate.
 *
 *      Claims require lodging a deposit equivalent to 365 days' registration of
 *      the name. If the claim is approved, this deposit is spent, and the name
 *      is registered for the claimant for 365 days. If the claim is declined,
 *      the deposit will be returned.
 */
contract ShortNameClaims {
    using Roles for Roles.Role;

    uint constant public REGISTRATION_PERIOD = 31536000;

    using Buffer for Buffer.buffer;
    using BytesUtils for bytes;
    using StringUtils for string;

    enum Phase {
        OPEN,
        REVIEW,
        FINAL
    }

    enum Status {
        PENDING,
        APPROVED,
        DECLINED,
        WITHDRAWN
    }

    struct Claim {
        bytes32 labelHash;
        address claimant;
        uint paid;
        Status status;
    }

    Roles.Role owners;
    Roles.Role ratifiers;

    PriceOracle public priceOracle;
    BaseRegistrar public registrar;
    mapping(bytes32=>Claim) public claims;
    mapping(bytes32=>bool) approvedNames;
    uint public pendingClaims;
    uint public unresolvedClaims;
    Phase public phase;

    event ClaimSubmitted(string claimed, bytes dnsname, uint paid, address claimant, string email);
    event ClaimStatusChanged(bytes32 indexed claimId, Status status);

    constructor(PriceOracle _priceOracle, BaseRegistrar _registrar, address _ratifier) public {
        priceOracle = _priceOracle;
        registrar = _registrar;
        phase = Phase.OPEN;

        owners.add(msg.sender);
        ratifiers.add(_ratifier);
    }

    modifier onlyOwner() {
        require(owners.has(msg.sender), "Caller must be an owner");
        _;
    }

    modifier onlyRatifier() {
        require(ratifiers.has(msg.sender), "Caller must be a ratifier");
        _;
    }

    modifier inPhase(Phase p) {
        require(phase == p, "Not in required phase");
        _;
    }

    function addOwner(address owner) external onlyOwner {
        owners.add(owner);
    }

    function removeOwner(address owner) external onlyOwner {
        owners.remove(owner);
    }

    function addRatifier(address ratifier) external onlyRatifier {
        ratifiers.add(ratifier);
    }

    function removeRatifier(address ratifier) external onlyRatifier {
        ratifiers.remove(ratifier);
    }

    /**
     * @dev Computes the claim ID for a submitted claim, so it can be looked up
     *      using `claims`.
     * @param claimed The name being claimed (eg, 'foo')
     * @param dnsname The DNS-encoded name supporting the claim (eg, 'foo.test')
     * @param claimant The address making the claim.
     * @return The claim ID.
     */
    function computeClaimId(string memory claimed, bytes memory dnsname, address claimant, string memory email) public pure returns(bytes32) {
        return keccak256(abi.encodePacked(keccak256(bytes(claimed)), keccak256(dnsname), claimant, keccak256(bytes(email))));
    }

    /**
     * @dev Returns the cost associated with placing a claim.
     * @param claimed The name being claimed.
     * @return The cost in wei for this claim.
     */
    function getClaimCost(string memory claimed) public view returns(uint) {
        return priceOracle.price(claimed, 0, REGISTRATION_PERIOD);
    }

    /**
     * @dev Submits a claim for an exact match (eg, foo.test -> foo.eth).
     *      Claimants must provide an amount of ether equal to 365 days'
     *      registration cost; call `getClaimCost` to determine this amount.
     *      Claimants should supply a little extra in case of variation in price;
     *      any excess will be returned to the sender.
     * @param name The DNS-encoded name of the domain being used to support the
     *             claim.
     * @param claimant The address of the claimant.
     * @param email An email address for correspondence regarding the claim.
     */
    function submitExactClaim(bytes memory name, address claimant, string memory email) public payable {
        string memory claimed = getLabel(name, 0);
        handleClaim(claimed, name, claimant, email);
    }

    /**
     * @dev Submits a claim for match on name+tld (eg, foo.tv -> footv).
     *      Claimants must provide an amount of ether equal to 365 days'
     *      registration cost; call `getClaimCost` to determine this amount.
     *      Claimants should supply a little extra in case of variation in price;
     *      any excess will be returned to the sender.
     * @param name The DNS-encoded name of the domain being used to support the
     *             claim.
     * @param claimant The address of the claimant.
     * @param email An email address for correspondence regarding the claim.
     */
    function submitCombinedClaim(bytes memory name, address claimant, string memory email) public payable {
        bytes memory firstLabel = bytes(getLabel(name, 0));
        bytes memory secondLabel = bytes(getLabel(name, 1));
        Buffer.buffer memory buf;
        buf.init(firstLabel.length + secondLabel.length);
        buf.append(firstLabel);
        buf.append(secondLabel);

        handleClaim(string(buf.buf), name, claimant, email);
    }

    /**
     * @dev Submits a claim for prefix match (eg, fooeth.test -> foo.eth).
     *      Claimants must provide an amount of ether equal to 365 days'
     *      registration cost; call `getClaimCost` to determine this amount.
     *      Claimants should supply a little extra in case of variation in price;
     *      any excess will be returned to the sender.
     * @param name The DNS-encoded name of the domain being used to support the
     *             claim.
     * @param claimant The address of the claimant.
     * @param email An email address for correspondence regarding the claim.
     */
    function submitPrefixClaim(bytes memory name, address claimant, string memory email) public payable {
        bytes memory firstLabel = bytes(getLabel(name, 0));
        require(firstLabel.equals(firstLabel.length - 3, bytes("eth")));
        handleClaim(string(firstLabel.substring(0, firstLabel.length - 3)), name, claimant, email);
    }

    /**
     * @dev Closes the claim submission period.
     *      Callable only by the owner.
     */
    function closeClaims() external onlyOwner inPhase(Phase.OPEN) {
        phase = Phase.REVIEW;
    }

    /**
     * @dev Ratifies the current set of claims.
     *      Ratification freezes the claims and their resolutions, and permits
     *      them to be acted on.
     */
    function ratifyClaims() external onlyRatifier inPhase(Phase.REVIEW) {
        // Can't ratify until all claims have a resolution.
        require(pendingClaims == 0);
        phase = Phase.FINAL;
    }

    /**
     * @dev Cleans up the contract, after all claims are resolved.
     *      Callable only by the owner, and only in final state.
     */
    function destroy() external onlyOwner inPhase(Phase.FINAL) {
        require(unresolvedClaims == 0);
        selfdestruct(toPayable(msg.sender));
    }

    /**
     * @dev Sets the status of a claim to either APPROVED or DECLINED.
     *      Callable only during the review phase, and only by the owner or
     *      ratifier.
     * @param claimId The claim to set the status of.
     * @param approved True if the claim is approved, false if it is declined.
     */
    function setClaimStatus(bytes32 claimId, bool approved) public inPhase(Phase.REVIEW) {
        // Only callable by owner or ratifier
        require(owners.has(msg.sender) || ratifiers.has(msg.sender));

        Claim memory claim = claims[claimId];
        require(claim.paid > 0, "Claim not found");

        if(claim.status == Status.PENDING) {
          // Claim went from pending -> approved/declined; update counters
          pendingClaims--;
          unresolvedClaims++;
        } else if(claim.status == Status.APPROVED) {
          // Claim was previously approved; remove from approved map
          approvedNames[claim.labelHash] = false;
        }

        // Claim was just approved; check the name was not already used, and add
        // to approved map
        if(approved) {
          require(!approvedNames[claim.labelHash]);
          approvedNames[claim.labelHash] = true;
        }

        Status status = approved?Status.APPROVED:Status.DECLINED;
        claims[claimId].status = status;
        emit ClaimStatusChanged(claimId, status);
    }

    /**
     * @dev Sets the status of multiple claims. Callable only during the review
     *      phase, and only by the owner or ratifier.
     * @param approved A list of approved claim IDs.
     * @param declined A list of declined claim IDs.
     */
    function setClaimStatuses(bytes32[] calldata approved, bytes32[] calldata declined) external {
        for(uint i = 0; i < approved.length; i++) {
            setClaimStatus(approved[i], true);
        }
        for(uint i = 0; i < declined.length; i++) {
            setClaimStatus(declined[i], false);
        }
    }

    /**
     * @dev Resolves a claim. Callable by anyone, only in the final phase.
     *      Resolving a claim either registers the name or refunds the claimant.
     * @param claimId The claim ID to resolve.
     */
    function resolveClaim(bytes32 claimId) public inPhase(Phase.FINAL) {
        Claim memory claim = claims[claimId];
        require(claim.paid > 0, "Claim not found");

        if(claim.status == Status.APPROVED) {
            registrar.register(uint256(claim.labelHash), claim.claimant, REGISTRATION_PERIOD);
            toPayable(registrar.owner()).transfer(claim.paid);
        } else if(claim.status == Status.DECLINED) {
            toPayable(claim.claimant).transfer(claim.paid);
        } else {
            // It should not be possible to get to FINAL with claim IDs that are
            // not either APPROVED or DECLINED.
            assert(false);
        }

        unresolvedClaims--;
        delete claims[claimId];
    }

    /**
     * @dev Resolves multiple claims. Callable by anyone, only in the final phase.
     * @param claimIds A list of claim IDs to resolve.
     */
    function resolveClaims(bytes32[] calldata claimIds) external {
        for(uint i = 0; i < claimIds.length; i++) {
            resolveClaim(claimIds[i]);
        }
    }

    /**
     * @dev Withdraws a claim and refunds the claimant.
     *      Callable only by the claimant, at any time.
     * @param claimId The ID of the claim to withdraw.
     */
    function withdrawClaim(bytes32 claimId) external {
        Claim memory claim = claims[claimId];

        // Only callable by claimant
        require(msg.sender == claim.claimant);

        if(claim.status == Status.PENDING) {
            pendingClaims--;
        } else {
            unresolvedClaims--;
        }

        toPayable(claim.claimant).transfer(claim.paid);
        emit ClaimStatusChanged(claimId, Status.WITHDRAWN);
        delete claims[claimId];
    }

    function handleClaim(string memory claimed, bytes memory name, address claimant, string memory email) internal inPhase(Phase.OPEN) {
        uint len = claimed.strlen();
        require(len >= 3 && len <= 6);

        bytes32 claimId = computeClaimId(claimed, name, claimant, email);
        require(claims[claimId].paid == 0, "Claim already submitted");

        // Require that there are at most two labels (name.tld)
        require(bytes(getLabel(name, 2)).length == 0, "Name must be a 2LD");

        uint price = getClaimCost(claimed);
        require(msg.value >= price, "Insufficient funds for reservation");
        if(msg.value > price) {
            msg.sender.transfer(msg.value - price);
        }

        claims[claimId] = Claim(keccak256(bytes(claimed)), claimant, price, Status.PENDING);
        pendingClaims++;
        emit ClaimSubmitted(claimed, name, price, claimant, email);
    }

    function getLabel(bytes memory name, uint idx) internal pure returns(string memory) {
        // Skip the first `idx` labels
        uint offset = 0;
        for(uint i = 0; i < idx; i++) {
            if(offset >= name.length) return "";
            offset += name.readUint8(offset) + 1;
        }

        // Read the label we care about
        if(offset >= name.length) return '';
        uint len = name.readUint8(offset);
        return string(name.substring(offset + 1, len));
    }

    function toPayable(address addr) internal pure returns(address payable) {
        return address(uint160(addr));
    }
}
