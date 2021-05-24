const TestBytesUtils = artifacts.require("./test/dnssec-oracle/TestBytesUtils");
const TestRRUtils = artifacts.require("./test/dnssec-oracle/TestRRUtils");
const TestBuffer = artifacts.require("./test/dnssec-oracle/TestBuffer");

[TestBytesUtils, TestRRUtils, TestBuffer].forEach(function(testsuite) {
  contract(testsuite.contractName, function(accounts) {
    let instance;
    before(async () => {
        instance = await testsuite.new();
    });
    for(const a of testsuite.abi) {
        if(a.name.startsWith('test')) {
            it(a.name, async () => {
                await instance[a.name]();
            });
        }
    }
  });
});