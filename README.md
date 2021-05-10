# ENS NFT Fuse wrapper

The ENS NFT Fuse wrapper is a smart contract that can wrap an existing .eth domain or any other kind of ENS name, such as a DNS name or subdomain as a ERC1155 token. It uses a modified ERC1155 contract to make things more gas efficient to track ownership and exposes an ERC721-like API. The motives for the contract is to make all ENS names including subdomains, .eth and DNSSEC names ERC721 compatible and use a consistent API. This would allow subdomains/DNSSEC names to also be visible on wallets that support ERC721 and 1155. It would also allow subdomains to be sold and traded on platforms like OpenSea without any additional work from the platform apart from supporting the relevant tokens.

The other part of the wrapper is to allow for permissions to be burned. This allows a parent name to be able to provably show it cannot take back a subdomain once issued. This would alllow other contracts like a subdomain registrar to distribute or sell names without being able to take them back once given out. This is because due to ENS's recursive nature, the parent can always take back the name if the ownership is only governed by the ENS registry.

The NFT Fuse Wrapper's interface is as follows:

```sol
function makeNode(bytes32 node, bytes32 label)
```

Creates a namehash

```
modifier ownerOnly(bytes32 node)
```

Modifier that checks if the msg.sender is the owner or an authorised caller

```
function isOwnerOrApproved(bytes32 node, address addr)
    public
    view
    override
    returns (bool)
```

Helper function that checks if the msg.sender is the owner or an authorised caller and returns true/false

```
function getFuses(bytes32 node) public view returns (uint96)
```

Helper function that gets the fuses for a particular node

```
function canUnwrap(bytes32 node) public view returns (bool)
```

Returns whether or not a domain can be unwrapped

```
function canBurnFuses(bytes32 node) public view returns (bool)
```

Returns whether or not a domain can burn fuses

```
function canTransfer(bytes32 node) public view returns (bool)
```

Returns whether or not a domain can burn fuses

```
function canSetData(bytes32 node) public view returns (bool)
```

Returns whether or not a domain can set data, includes resolver and TTL.

```
function canCreateSubdomain(bytes32 node) public view returns (bool)
```

Returns whether or not a domain can set data, includes resolver and TTL.

```
function canReplaceSubdomain(bytes32 node) public view returns (bool)
```

Returns whether or not a domain can replace a subdomain that already exists

```
function canCallSetSubnodeOwner(bytes32 node, bytes32 label)
        public
        returns (bool)
```

```
function _mint(
    uint256 tokenId,
    address newOwner,
    uint96 fuses
)
```

Mints a new ERC1155 with fuses and owner

```
function _burn(uint256 tokenId) private
```

Burns an existing ERC1155 and sets fuses to 0

```
function wrapETH2LD(
    string calldata label,
    uint96 _fuses,
    address wrappedOwner
) public override
```

Wraps an existing .eth domain and allows the setting of fuses and the owner within the contract. Should set the ENS Registry owner to this contract allowing the wrapper to control the name within the registry and resolvers. Should only work with .eth domains

```
function _wrapETH2LD(
    bytes32 label,
    bytes32 node,
    uint96 _fuses,
    address wrappedOwner
) private
```

Internal function that holds most of the basic functionality for wrapping an existing .eth domain. Not callable outside of this contract, but used with the `wrapETH2LD` and `onERC721received`

```
    function wrap(
        bytes32 parentNode,
        string calldata label,
        uint96 _fuses,
        address wrappedOwner
    ) public
```

Wraps an existing domain and allows the setting of fuses and the owner within the contract. Should set the ENS Registry owner to this contract allowing the wrapper to control the name within the registry and resolvers. Should not work with .eth domains. Should only be callable by the owner in the registry.

```
function _wrap(
    bytes32 parentNode,
    bytes32 label,
    uint96 _fuses,
    address wrappedOwner
) private
```

Internal function that holds most of the basic functionality for wrapping an existing domain. Not callable outside of this contract, but used with `wrap()` `setSubnodeOwnerAndWrap()` and `setSubnodeRecordAndWrap()`.

```
function unwrap(
    bytes32 parentNode,
    bytes32 label,
    address owner
) public override ownerOnly(makeNode(parentNode, label))
```

Allows unwrapping a name and sets all fuses to 0. Should revert
if domain is unwrappable or is a .eth domain. Should only be callable by the owner in this contract or an authorised caller.

```
function _unwrap(
    bytes32 parentNode,
    bytes32 label,
    address owner
) private
```

Internal function that holds most of the functionality of unwrapping a domain. Not callable outside this contract. Used in both unwraps, .eth and non .eth domains.

```
function unwrapETH2LD(bytes32 label, address newOwner)
    public
    ownerOnly(makeNode(ETH_NODE, label))
```

Allows unwrapping a name and sets all fuses to 0. Should revert
if domain is unwrappable or is a .eth domain. Should only be callable by the owner in this contract or an authorised caller.

```
function burnFuses(
    bytes32 parentNode,
    bytes32 label,
    uint96 _fuses
) public ownerOnly(makeNode(parentNode, label))
```

Allows the burning of fuses for a name. Should be able to burn fuses that have not been defined in the interface to allow extensibility of the fuses.

```
function setRecord(
    bytes32 node,
    address owner,
    address resolver,
    uint64 ttl
) public ownerOnly(node)
```

Calls through to ens.setRecord and sets all the relevant records on the ENS Registry.

```
function setSubnodeRecord(
    bytes32 node,
    bytes32 label,
    address owner,
    address resolver,
    uint64 ttl
) public ownerOnly(node)
```

Calls through to ens.setSubnodeRecord and sets all the relevant records on the ENS Registry.

```
    function setSubnodeOwner(
        bytes32 node,
        bytes32 label,
        address newOwner
    ) public override ownerOnly(node) returns (bytes32)
```

Calls through to ens.setSubnodeOwner and sets all the relevant records on the ENS Registry.

```
function setSubnodeOwnerAndWrap(
    bytes32 parentNode,
    string calldata label,
    address newOwner,
    uint96 _fuses
) public override returns (bytes32)
```

Calls through to ens.setSubnodeOwner and sets all the relevant records on the ENS Registry. Then it will proceed to wrap that subdomain and add fuses.

```
function setSubnodeRecordAndWrap(
    bytes32 parentNode,
    string calldata label,
    address newOwner,
    address resolver,
    uint64 ttl,
    uint96 _fuses
) public override returns (bytes32)
```

Calls through to ens.setSubnodeRecord and sets all the relevant records on the ENS Registry. Then it will proceed to wrap that subdomain and add fuses.

```
function setResolver(bytes32 node, address resolver)
    public
    override
    ownerOnly(node)
```

Calls through to ens.setResolver and sets the resolver on the registry.

```
function setTTL(bytes32 node, uint64 ttl) public ownerOnly(node)
```

Calls through to ens.setTTT and sets the TTL on the registry.

```
    function onERC721Received(
        address operator,
        address from,
        uint256 tokenId,
        bytes calldata data
    ) public returns (bytes4)
```

Wraps a .ETH name when an existing ERC721 from the registrar is sent to the contract. Should only be callable by the .ETH registrar when transfering an existing ERC721 and should revert otherwise
