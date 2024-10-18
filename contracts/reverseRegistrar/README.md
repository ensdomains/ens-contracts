# L2 Reverse Registrar

## Summary

The L2 Reverse registrar is a combination of a resolver and a reverse registrar that allows the name to be set for a particular reverse node.

## Inception Date

Inception date is set in milliseconds, so needs to be divided by 1000 to be compared to block.timestamp which is in seconds

## Setting records

You can set records using one of the follow functions:

`setName()` - uses the msg.sender's address and allows you to set a record for that address only

`setNameForAddr()` - uses the address parameter instead of `msg.sender` and checks if the `msg.sender` is authorised by checking if the contract's owner (via the Ownable pattern) is the msg.sender

`setNameForAddrWithSignature()` - uses the address parameter instead of `msg.sender` and allows authorisation via a signature

`setNameForAddrWithSignatureAndOwnable()` - uses the address parameter instead of `msg.sender`. The sender is authorised by checking if the contract's owner (via the Ownable pattern) is the msg.sender, which then checks that the signer has authorised the record on behalf of msg.sender using `ERC1271`

## Signatures for setting records

Signatures use a double keccak256 structure that first hashes the function id with the variables that you are passing to that function. It then hashes the result of that with the rest of the parameters.
