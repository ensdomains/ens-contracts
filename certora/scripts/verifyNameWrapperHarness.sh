certoraRun ./certora/harness/NameWrapper1.sol:NameWrapperHarness \
./certora/munged/UpgradedNameWrapperMock.sol \
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
--optimistic_loop \
--rule_sanity \
--send_only \
--staging master \
--settings -copyLoopUnroll=3 \
--msg "ENS NameWrapper : NameWrapper harness 1"

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
