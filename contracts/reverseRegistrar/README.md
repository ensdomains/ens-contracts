# L2 Reverse Registrar

## Summary

The L2 Reverse Registrar is a combination of a resolver and a reverse registrar that allows the name to be set for a particular reverse node.

## Setting records

You can set records using one of the follow functions:

`setName()` - uses the msg.sender's address and allows you to set a record for that address only

`setNameForAddr()` - uses the address parameter instead of `msg.sender` and checks if the `msg.sender` is authorised by checking if the contract's owner (via the Ownable pattern) is the msg.sender

`setNameForAddrWithSignature()` - uses the address parameter instead of `msg.sender` and allows authorisation via a signature

`setNameForOwnableWithSignature()` - uses the address parameter instead of `msg.sender`. The sender is authorised by checking if the contract's owner (via the Ownable pattern) is the msg.sender, which then checks that the signer has authorised the record on behalf of msg.sender using `ERC1271` (or `ERC6492`)

## Signatures for setting records

The signature format for `setNameForAddrWithSignature` is:

```
validatorAddress, // 0xa4a5CaA360A81461158C96f2Dbad8944411CF3fd for mainnet, 0xAe91c512BC1da8B00cd33dd9D9C734069e6E0fcd for testnet
functionSignature, // 0x2023a04c
name, // string name value
addr, // address to set name for
coinTypes, // array of coinTypes wanting to be set
signatureExpiry // expiry of the signature, up to 1 hour in the future
```

The signature format for `setNameForOwnableWithSignature` is:

```
validatorAddress, // 0xa4a5CaA360A81461158C96f2Dbad8944411CF3fd for mainnet, 0xAe91c512BC1da8B00cd33dd9D9C734069e6E0fcd for testnet
functionSignature, // 0x975713ad
name, // string name value
contractAddr, // contract address to set name for
owner, // owner address of contract (i.e. the signature being verified)
coinTypes, // array of coinTypes wanting to be set
signatureExpiry // expiry of the signature, up to 1 hour in the future
```
