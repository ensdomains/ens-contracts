pragma solidity >=0.8.4;

contract MetaDataService {
    string private _uri;

    constructor(string memory _metaDataUri) {
        _uri = _metaDataUri;
    }

    function uri() public view returns (string memory) {
        return _uri;
    }
}
