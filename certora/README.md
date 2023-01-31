## Verification Overview
The current directory contains Certora's formal verification of ENS NameWrapper contract.
In this directory you will find five sub-directories:

1. specs - Contains all the specification files that were written by Certora for the NameWrapper contract verification.

- `NameWrapperDemo.spec`  - The main specification file for the NameWrapper contract.
Contains everything needed for the verification of the contract. Includes methods block, definitions, CVL functions, rules etc.
- `NameWrapper.spec` - Same as the demo spec file, but includes more rules and helper functions. This is mainly used by the Certora team to test the code further and for experimentation.
- `erc20.spec` contains a methods block that dispatches all erc20 interface functions.

2. scripts - Contains the necessary run scripts to execute the spec files on the Certora Prover. These scripts are composed of a run-command of the Certora Prover contracts to take into account in the verification context, declaration of the compiler and a set of additional settings. 
- `verifyNameWrapperDemo.sh` is a script for running of the `NameWrapperDemo.spec` on the  `NameWrapperHarness.sol` contract.
- `verifyNameWrapperNoUpgrade.sh` is a script for running of the `NameWrapper.spec` on the  `NameWrapperHarness.sol` contract. 

The run scripts include more contracts like the ENSRegistry or the BaseRegistrarImplementation so that they will be considered into the scope and their implementations would be used. Currently the scope of both scripts omits the upgraded NameWrapper contract and its relevant functions inside `NameWrapper.sol`.
To run a specific rule rather than the entire spec, add `--rule [name of rule]` to the script file. One can add several lines this way.

3. harness - Contains all the inheriting contracts that add/simplify functionalities to the original contract, together with our own Mock contracts

We use the following harnessed files:
- `NameWrapperHarness.sol` - the main contract that is verified. Inherits from the original `NameWrapper` contract. This file contains simple getter functions for easier use through CVL and additional overriding functions from the parent contract that suppose to maintain the original functionality. Note that the current scope neglects the upgradeContract functionality and these functions are empty in the harnessed contract.

- `BytesUtilsHarness.sol` - A replacement of the original BytesUtils.sol library. As a result of techincal issue with dealing with the hashing function of `keccak`, we replaced that function with a similar implementation of our own.

- `ERC721A.sol` - an instance of the OZ ERC721 standard contract.

- `ERC20A.sol` - an instance of the OZ ERC20 standard contract.

You may add any additional mock contracts to this folder, and import them to the running script. Simply add their relative path to the first part of script file, where you would see the list of all Solidity files used by the tool.
If the mock file's name is different than the name of the contract it holds,
simply add a ':' after the name of the file and then the name of the contract. e.g.
`.certora/harness/myFile.sol:myContract`.

4. munged - a folder that is supposed to contain modified versions of some contracts from the original ./contracts directory. The modifications are minor in nature, allowing better access or handling of variables/functions by the CVL spec files and/or the prover. The harnessed contracts usually inherit/make use of the contracts in this folder rather than in the original directory. Once the 'make munge' command is run, the differences recorded in applyHarness.patch would be applied to the original versions and then recreated in this folder. See the running directions below.

5. archive - a folder that contains previous working files created by the Certora team. They are not used, and shall not be used for verification purposes. 

</br>

---

## Running Instructions
To run a verification job:

1. Open terminal and `cd` your way to the across-token directory.

2. For first time verification, after pulling from git, go to ./certora
and then run 'make munge'. This will apply the changes recorded in applyHarness.patch to the munged folder, where the contracts are stored.

3. Go back to core directory ../ 

4. Run the script you'd like to get results for:
   ```
   sh certora/scripts/verifyNameWrapperDemo.sh
   ```
