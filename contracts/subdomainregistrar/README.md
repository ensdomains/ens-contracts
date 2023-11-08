# Subdomain Registrars

** Note: This subdomain registrar contract only works with wrapped ENS name **

The Subdomain registrar is an example contract, that can be deployed to allow registration of subnames under one or more names. The functionality is intentionally simple to allow more complicated to be custom logic to be layered on top of the basic subdomain registration functionality.

The registrars layer on top of the BaseSubdomainRegistrar contract to allow additional functionality such as renting or forever subnames. They also restrict it to names that have called setupDomain with active set to true to not accidentally allow any names to have subnames registered underneath it. This means that `setApprovalForAll` will not automatically allow the subdomain contract to On top of that, each registrar takes a pricer that can control the pricing of a specific name in more granular detail.

## Pricing

Pricing is setup _per name_ and allows customisable by the user providing their name to the Subdomain Registrar contract.

All names that are setup will include a pricer, which is a contract that implements the `ISubnamePricer` interface. This takes the parentNode, the label as a string and a duration. All or none of these can be used to generate the correct price for a subname.

## Forever Subdomain Registrar

This is a basic FIFS (First in first serve) registrar. The registration can take a fixed fee, or this fee can be set to 0 if you wish for subnames to be free. Names automatically are set to the parent's expiry can the fuse for `CAN_EXTEND_EXPIRY` will be burnt on registration so the user can extend their expiry if the parent also extends theirs. For a better UX, it is recommened that the parent sets their expiration as high as possible to allow their users to not have to think about renewing.

## Rental Subdomain registrar

This is a basic FIFS (First in first serve) registrar. The key difference between this and the ForeverSubdomainRegistrar is that it does not auto burn the `CAN_EXTEND_EXPIRY` fuse and instead exposes a `renew()` function that allows paid renewal. This registrar also needs to be paired with a rental-based pricing contract. For simplicity the deployer can deploy this pricing contract and the UI can pass through this address to `setupDomain()` when a new user wants to

## Deployment and Setup

Deploying your own Subdomain registrar takes a few steps. The contracts assumes that the name is already wrapped.

1. Deploy the Pricing contract you would like to use e.g. FixedPricer.sol
2. Deploy the SubdomainRegistrar e.g. ForeverSubdomainRegistar.sol
3. Call setupDomain() with the name you would like to issue subdomains on and pass the address of the Pricing contract
4. Call setApprovalForAll() on the account that owns the name
