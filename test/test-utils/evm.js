const Promise = require('bluebird');

const advanceTime = Promise.promisify(function(delay, done) {
    web3.currentProvider.send({
        jsonrpc: "2.0",
        "method": "evm_increaseTime",
        params: [delay]}, done)
});

module.exports = {
    advanceTime: advanceTime
}

