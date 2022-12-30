certoraRun ./certora/harness/TestBytesUtils.sol:TestBytesUtilsCertora \
--verify TestBytesUtilsCertora:./certora/specs/BytesUtils.spec \
--solc solc8.17 \
--loop_iter 4 \
--cloud \
--optimistic_loop \
--send_only \
--settings -mediumTimeout=200,-copyLoopUnroll=5,-smt_hashingScheme=PlainInjectivity \
--settings -recursionEntryLimit=2,-recursionErrorAsAssert=false \
--msg "ENS BytesUtils Library PlainInjectivity"