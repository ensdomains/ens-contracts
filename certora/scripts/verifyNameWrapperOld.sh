certoraRun ./certora/munged/NameWrapper.sol \
./certora/munged/UpgradedNameWrapperMock.sol \
./contracts/wrapper/StaticMetadataService.sol \
./contracts/ethregistrar/BaseRegistrarImplementation.sol \
./contracts/registry/ENSRegistry.sol \
./contracts/wrapper/mocks/ERC1155ReceiverMock.sol \
./certora/harness/ERC20A.sol \
\
\
--verify NameWrapper:certora/specs/NameWrapper.spec \
\
\
--link  NameWrapper:registrar=BaseRegistrarImplementation \
        NameWrapper:metadataService=StaticMetadataService \
        NameWrapper:ens=ENSRegistry \
        NameWrapper:upgradeContract=UpgradedNameWrapperMock \
        BaseRegistrarImplementation:ens=ENSRegistry \
        UpgradedNameWrapperMock:ens=ENSRegistry \
        UpgradedNameWrapperMock:registrar=BaseRegistrarImplementation \
        UpgradedNameWrapperMock:oldNameWrapper=NameWrapper \
\
\
--solc solc8.17 \
--loop_iter 4 \
--staging master \
--optimistic_loop \
--rule cannotWrapTwice \
--send_only \
--settings -contractRecursionLimit=2,-copyLoopUnroll=7 \
--msg "ENS NameWrapper : cannotWrapTwice"

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
