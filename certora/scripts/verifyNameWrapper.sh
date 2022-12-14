if [[ "$1" ]]
then
    RULE="--rule $1"
fi

if [[ "$2" ]]
then
    MSG=": $2"
fi

certoraRun  contracts/wrapper/NameWrapper.sol \
--verify NameWrapper:Certora/NameWrapper.spec \
--solc solc8.17 --optimize 200 --solc_args '["--via-ir"]' \
--staging shelly/fixForENSOptimized \
--send_only \
--settings -enableEqualitySaturation=false \
$RULE  \
--msg "ENS -$RULE $MSG" #\