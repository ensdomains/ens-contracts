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
--loop_iter 2 \
--staging master \
--optimistic_loop \
--send_only \
--rule cannotBurn_CANNOT_UNWRAP_Unless_PARENT_CANNOT_CONTROL_IsBurned \
--settings -t=1600,-mediumTimeout=40,-copyLoopUnroll=3,-optimisticUnboundedHashing=true \
--settings -recursionEntryLimit=2,-recursionErrorAsAssert=false \
--msg "ENS NameWrapper: cannotBurn_CANNOT_UNWRAP_Unless_PARENT_CANNOT_CONTROL_IsBurned setFuses with havoc"
