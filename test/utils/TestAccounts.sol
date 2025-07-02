// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

/**
 * @title TestAccounts
 * @dev Standardized test accounts for ENS test suite
 * Using a library with functions to generate accounts allows for both
 * predetermined addresses and dynamic account generation
 */
library TestAccounts {
    // ============ Core Test Accounts ============
    // These are the primary accounts used across most tests
    
    function deployer() internal pure returns (address) {
        return address(0x1);
    }
    
    function owner() internal pure returns (address) {
        return address(0x2);
    }
    
    function account() internal pure returns (address) {
        return address(0x3);
    }
    
    function account2() internal pure returns (address) {
        return address(0x4);
    }
    
    function account3() internal pure returns (address) {
        return address(0x5);
    }
    
    // ============ Role-based Accounts ============
    
    function registrant() internal pure returns (address) {
        return address(0x6);
    }
    
    function controller() internal pure returns (address) {
        return address(0x7);
    }
    
    function referrer() internal pure returns (address) {
        return address(0x8);
    }
    
    function resolver() internal pure returns (address) {
        return address(0x9);
    }
    
    function operator() internal pure returns (address) {
        return address(0xA);
    }
    
    function approved() internal pure returns (address) {
        return address(0xB);
    }
    
    function newOwner() internal pure returns (address) {
        return address(0xC);
    }
    
    function unauthorised() internal pure returns (address) {
        return address(0xD);
    }
    
    function other() internal pure returns (address) {
        return address(0xE);
    }
    
    function random() internal pure returns (address) {
        return address(0xF);
    }
    
    // ============ Indexed Account Generation ============
    
    /**
     * @dev Get an account by index (useful for loops)
     * @param index The account index (0-based)
     * @return The address at that index
     */
    function getAccount(uint256 index) internal pure returns (address) {
        require(index < 256, "Account index out of range");
        return address(uint160(index + 1));
    }
    
    /**
     * @dev Get multiple accounts
     * @param count Number of accounts to return
     * @return accounts Array of addresses
     */
    function getAccounts(uint256 count) internal pure returns (address[] memory accounts) {
        require(count <= 256, "Too many accounts requested");
        accounts = new address[](count);
        for (uint256 i = 0; i < count; i++) {
            accounts[i] = getAccount(i);
        }
    }
    
    // ============ Special Addresses ============
    
    function zeroAddress() internal pure returns (address) {
        return address(0);
    }
    
    function deadAddress() internal pure returns (address) {
        return address(0xdead);
    }
    
    function burnAddress() internal pure returns (address) {
        return address(0xB07);  // "burn" in hex-like format
    }
    
    // ============ Placeholder Addresses ============
    
    function placeholderAddr() internal pure returns (address) {
        return address(0x1234);
    }
    
    // ============ Named Test Accounts ============
    
    function account0() internal pure returns (address) {
        return address(0x1111);
    }
    
    function account1() internal pure returns (address) {
        return address(0x2222);
    }
    
    function account2Alternative() internal pure returns (address) {
        return address(0x3333);
    }
    
    // ============ Utility Functions ============
    
    /**
     * @dev Check if an address is a test account
     * @param addr The address to check
     * @return True if the address is one of our test accounts
     */
    function isTestAccount(address addr) internal pure returns (bool) {
        uint160 addrNum = uint160(addr);
        // Check if it's in our main range (0x1 - 0xFF)
        if (addrNum >= 1 && addrNum <= 255) {
            return true;
        }
        // Check special addresses
        if (addr == address(0x1111) || addr == address(0x2222) || addr == address(0x3333)) {
            return true;
        }
        if (addr == address(0x1234) || addr == address(0x5678)) {
            return true;
        }
        if (addr == address(0xdead) || addr == address(0xB07)) {
            return true;
        }
        return false;
    }
    
    /**
     * @dev Get a label for a test account (useful for debugging)
     * @param addr The address to label
     * @return The label for the address
     */
    function getLabel(address addr) internal pure returns (string memory) {
        if (addr == deployer()) return "deployer";
        if (addr == owner()) return "owner";
        if (addr == account()) return "account";
        if (addr == account2()) return "account2";
        if (addr == account3()) return "account3";
        if (addr == registrant()) return "registrant";
        if (addr == controller()) return "controller";
        if (addr == referrer()) return "referrer";
        if (addr == resolver()) return "resolver";
        if (addr == operator()) return "operator";
        if (addr == approved()) return "approved";
        if (addr == newOwner()) return "newOwner";
        if (addr == unauthorised()) return "unauthorised";
        if (addr == other()) return "other";
        if (addr == random()) return "random";
        if (addr == zeroAddress()) return "zero";
        if (addr == deadAddress()) return "dead";
        if (addr == burnAddress()) return "burn";
        if (addr == account0()) return "account0";
        if (addr == account1()) return "account1";
        if (addr == account2Alternative()) return "account2Alt";
        
        // For indexed accounts
        uint160 addrNum = uint160(addr);
        if (addrNum >= 1 && addrNum <= 255) {
            return string(abi.encodePacked("account#", toString(addrNum - 1)));
        }
        
        return "unknown";
    }
    
    /**
     * @dev Convert uint to string (helper function)
     */
    function toString(uint256 value) private pure returns (string memory) {
        if (value == 0) {
            return "0";
        }
        uint256 temp = value;
        uint256 digits;
        while (temp != 0) {
            digits++;
            temp /= 10;
        }
        bytes memory buffer = new bytes(digits);
        while (value != 0) {
            digits -= 1;
            buffer[digits] = bytes1(uint8(48 + uint256(value % 10)));
            value /= 10;
        }
        return string(buffer);
    }
}