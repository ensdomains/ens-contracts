pragma solidity >=0.8.4;
import "@openzeppelin/contracts/utils/Strings.sol";

contract MetaDataService {
    using Strings for uint256;
    string private _uri;

    constructor(string memory _metaDataUri) {
        _uri = _metaDataUri;
    }

    function uri(uint256 tokenId) public view returns (string memory) {
        return string(abi.encodePacked(_uri, "/", tokenId.toString()));
    }
}
