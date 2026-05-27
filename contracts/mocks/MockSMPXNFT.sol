//SPDX-License-Identifier: MIT
pragma solidity ~0.8.17;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract MockSMPXNFT is ERC721, Ownable {
    uint256 public nextTokenId;
    address public minter;
    bool public mintingLocked;
    string private _nextTokenURI;
    mapping(uint256 => string) private _tokenURIs;

    event MinterUpdated(address minter);
    event MintingLocked();

    constructor() ERC721("SimpleX NFT: SMPX testnet access", "SMPXNFT") {}

    function mint(address to) external {
        require(!mintingLocked, "Minting locked");
        require(msg.sender == minter || msg.sender == owner(), "Not authorized");
        uint256 tokenId = nextTokenId++;
        _tokenURIs[tokenId] = _nextTokenURI;
        _mint(to, tokenId);
    }

    function setMinter(address newMinter) external onlyOwner {
        minter = newMinter;
        emit MinterUpdated(newMinter);
    }

    function setNextTokenURI(string calldata newTokenUri) external onlyOwner {
        _nextTokenURI = newTokenUri;
    }

    function lockMintingPermanently() external onlyOwner {
        mintingLocked = true;
        emit MintingLocked();
    }

    function burn(uint256 tokenId) external {
        require(ownerOf(tokenId) == msg.sender, "Not token owner");
        _burn(tokenId);
    }

    function withdraw() external onlyOwner {
        payable(owner()).transfer(address(this).balance);
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireMinted(tokenId);
        return _tokenURIs[tokenId];
    }
}
