# ENS NFT Fuse wrapper

The ENS NFT Fuse wrapper is a smart contract that can wrap an existing .eth domain or any other kind of ENS name, such as a DNS name or subdomain as a ERC1155 token. It uses a modified ERC1155 contract to make things more gas efficient to track ownership and exposes an ERC721-like API. The motives for the contract is to make all ENS names including subdomains, .eth and DNSSEC names ERC721 compatible and use a consistent API. This would allow subdomains/DNSSEC names to also be visible on wallets that support ERC721 and 1155. It would also allow subdomains to be sold and traded on platforms like OpenSea without any additional work from the platform apart from supporting the relevant tokens.

The other part of the wrapper is to allow for permissions to be burned. This allows a parent name to be able to provably show it cannot take back a subdomain once issued. This would alllow other contracts like a subdomain registrar to distribute or sell names without being able to take them back once given out. This is because due to ENS's recursive nature, the parent can always take back the name if the ownership is only governed by the ENS registry.

## Installation and setup

```bash
npm install
```

## Testing

First you need to run the hardhat chain and then run the tests

```bash
npm run chain
npm test
```

Any contract with `2` at the end, is referring to the contract being called by `account2`, rather than `account1`. This is for tests that require authorisating another user.
