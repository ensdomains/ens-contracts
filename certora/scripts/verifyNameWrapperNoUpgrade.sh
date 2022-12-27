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
--loop_iter 3 \
--cloud \
--optimistic_loop \
--rule wrapUnwrap \
--send_only \
--settings -mediumTimeout=100,-copyLoopUnroll=3 \
--settings -recursionEntryLimit=1,-recursionErrorAsAssert=false \
--msg "ENS NameWrapper : wrapUnwrap"
