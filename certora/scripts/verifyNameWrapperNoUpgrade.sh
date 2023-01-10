certoraRun ./certora/harness/NameWrapperHarness.sol \
./contracts/wrapper/StaticMetadataService.sol \
./contracts/ethregistrar/BaseRegistrarImplementation.sol \
./contracts/registry/ENSRegistry.sol \
./contracts/wrapper/mocks/ERC1155ReceiverMock.sol \
./certora/harness/ERC20A.sol \
\
\
--verify NameWrapperHarness:certora/specs/NameWrapper.spec \
\
\
--link  NameWrapperHarness:registrar=BaseRegistrarImplementation \
        NameWrapperHarness:metadataService=StaticMetadataService \
        NameWrapperHarness:ens=ENSRegistry \
        BaseRegistrarImplementation:ens=ENSRegistry \
\
\
--solc solc8.17 \
--loop_iter 4 \
--staging master \
--optimistic_loop \
--send_only \
--rule fusesAfterWrapETHL2D \
--rule fusesAfterWrap \
--rule_sanity \
--settings -t=500,-mediumTimeout=40,-copyLoopUnroll=4,-useBitVectorTheory \
--settings -recursionEntryLimit=2,-recursionErrorAsAssert=false \
--msg "ENS NameWrapper: fusesAfterWrap 2 rules"
