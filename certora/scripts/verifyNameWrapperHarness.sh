certoraRun ./certora/harness/NameWrapper1.sol:NameWrapperHarness \
./certora/harness/UpgradedNameWrapperMock.sol \
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
        NameWrapperHarness:upgradeContract=UpgradedNameWrapperMock \
        BaseRegistrarImplementation:ens=ENSRegistry \
        UpgradedNameWrapperMock:ens=ENSRegistry \
        UpgradedNameWrapperMock:registrar=BaseRegistrarImplementation \
        UpgradedNameWrapperMock:oldNameWrapper=NameWrapperHarness \
\
\
--solc solc8.17 \
--loop_iter 3 \
--staging \
--optimistic_loop \
--rule sanity \
--send_only \
--settings -contractRecursionLimit=1,-copyLoopUnroll=3 \
--msg "ENS NameWrapper : Sanity NameWrapper harness 1 move upgrade contract up"

##
#if [[ "$1" ]]
#then
#    RULE="--rule $1"
#fi
#
#if [[ "$2" ]]
#then
#    MSG=": $2"
#fi
#$RULE  \
#--msg "ENS -$RULE $MSG" #\
