methods {
    readLabel(uint256, uint256) returns (bytes32, uint256) envfree
    readLabelTwoWords(bytes32, bytes32, uint256) returns (bytes32, uint256) envfree
    namehash(uint256, uint256) returns (bytes32) envfree
    namehashTwoWords(bytes32, bytes32, uint256) returns (bytes32) envfree
    setNameAtIndex(string, uint256) envfree
}

/**************************************************
*              readLabel Rules                    *
**************************************************/
rule readLabelInjectivity() {
    bytes32 wordA_1;
    bytes32 wordA_2;
    bytes32 wordB_1;
    bytes32 wordB_2;
    uint256 offset = 0;

    bytes32 nodeA; uint256 newIdxA;
    bytes32 nodeB; uint256 newIdxB;

    nodeA, newIdxA = readLabelTwoWords(wordA_1, wordA_2, offset);
    nodeB, newIdxB = readLabelTwoWords(wordB_1, wordB_2, offset);

    assert (nodeA == nodeB && newIdxA == newIdxB) =>
        (wordA_1 == wordB_1 &&
        wordA_2 == wordB_2);
}

/**************************************************
*              nameHash Rules                     *
**************************************************/

rule nameHashInjectivity(bytes32 nodeA, bytes32 nodeB) {
    bytes32 wordA_1;
    bytes32 wordA_2;
    bytes32 wordB_1;
    bytes32 wordB_2;
    uint256 offset = 0;

    require nodeA == namehashTwoWords(wordA_1, wordA_2, offset);
    require nodeB == namehashTwoWords(wordB_1, wordB_2, offset);

    assert nodeA == nodeB => (wordA_1 == wordB_1 && wordA_2 == wordB_2);
}

rule nameHashOffset() {
    setNameAtIndex("Certora", 1);
    setNameAtIndex("ora", 2);
    bytes32 nodeA = namehash(1, 4);
    bytes32 nodeB = namehash(2, 0);
    assert nodeA == nodeB;
}
