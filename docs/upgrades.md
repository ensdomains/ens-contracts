# SimplexController upgrade & storage-layout invariants

`SimplexController` is the only non-verbatim contract in the SNRC deployment and
the only **upgradeable** one (ERC-1967 UUPS proxy; `_authorizeUpgrade` is
`onlyOwner`). A UUPS upgrade swaps the implementation behind a proxy whose
storage persists — so the new implementation **must keep the exact storage
layout** of the old one, only appending. Get this wrong and existing values
(prices, reserved names, the NFT gate, …) silently read from the wrong slots.

## Storage model

```
contract SimplexController is
    Initializable, Ownable2StepUpgradeable, UUPSUpgradeable, IETHRegistrarController, ERC165
```

Slots are laid out base-contracts-first. The OZ upgradeable parents
(`Initializable`, `Ownable2Step`, `UUPS`) reserve their own slots and carry
their own gaps — leave them alone. After them come this contract's variables
(`ens`, `base`, `minCommitmentAge`, … `priceOracleFrozen`), followed by:

```solidity
uint256[49] private __gap;   // shrinks as state is added
```

`__gap` was `[50]`; it dropped to `[49]` when `priceOracleFrozen` landed. It is
the budget for future state.

## Invariants (do not break these)

1. **Append only, from the front of `__gap`.** A new state variable is declared
   immediately *before* `__gap`, and `__gap`'s size is decremented by the number
   of 32-byte slots it consumes (one slot for a `mapping`, `address`, `bool`,
   `uintN`, `bytes32`; more for larger structs). Net slot count is unchanged.
2. **Never reorder, remove, retype, or rename-with-different-type** an existing
   state variable. Renaming with the identical type is fine (layout is by
   position+type, not name); changing the type or order corrupts every slot
   after it.
3. **Never reorder the base contracts** in the `is (...)` list — that also moves
   storage.
4. `constant` / `immutable` values are not in storage and may be changed or added
   freely.

### Adding a variable — example

```solidity
   bool public priceOracleFrozen;     // last existing var
+  address public treasuryV2;         // new var: takes 1 slot, declared here
-  uint256[49] private __gap;
+  uint256[48] private __gap;         // shrink by 1
```

## Pre-upgrade checklist

- [ ] **Validate the storage layout against the deployed implementation.** Use
      the OpenZeppelin Upgrades plugin — `upgrades.validateUpgrade(OldImpl,
      NewImpl)` (or `upgrades.upgradeProxy`, which validates first). The plugin
      (`@openzeppelin/hardhat-upgrades`) is **not yet a devDependency** — add it,
      or diff layouts manually with `forge inspect SimplexController storage-layout`
      (old vs new) / Hardhat's `storageLayout` build output.
- [ ] **Run the V2 upgrade test** (issue #9): deploy V1 behind a proxy, populate
      state (reserved names, min char length, NFT gate, treasury, oracle),
      upgrade to V2, and assert every V1 value survives unchanged and the new
      behaviour works.
- [ ] Confirm `_authorizeUpgrade` owner is the intended SNCC multisig before the
      upgrade tx (upgrade authority can also be renounced to make the contract
      immutable).
- [ ] Bump the `__gap` size in the same commit as any new state variable, so the
      two never drift.
