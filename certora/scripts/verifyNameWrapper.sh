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
        UpgradedNameWrapperMock:oldNameWrapper=NameWrapper \
        UpgradedNameWrapperMock:ens=ENSRegistry \
        UpgradedNameWrapperMock:registrar=BaseRegistrarImplementation \
\
\
--solc solc8.17 \
--optimistic_loop \
--loop_iter 2 \
--staging \
--rule customSanity \
--send_only \
--settings -contractRecursionLimit=1 \
--msg "ENS 15 : upgradeContract dispatch"

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
