certoraRun ./certora/munged/NameWrapper.sol \
./certora/harness/UpgradedNameWrapperMock.sol \
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
\
\
--solc solc8.17 \
--loop_iter 5 \
--staging \
--optimistic_loop \
--rule sanity \
--send_only \
--settings -contractRecursionLimit=1,-copyLoopUnroll=6 \
--msg "ENS NameWrapper : Sanity no upgradeContract linking"

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
