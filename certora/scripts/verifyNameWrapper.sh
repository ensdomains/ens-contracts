certoraRun ./certora/munged/NameWrapper.sol \
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
        BaseRegistrarImplementation:ens=ENSRegistry \
\
\
--solc solc8.17 \
--optimistic_loop \
--loop_iter 2 \
--staging \
--send_only \
--settings -contractRecursionLimit=1 \
--msg "ENS : remove immutables from linked contracts"

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
