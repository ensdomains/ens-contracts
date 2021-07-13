const digests = require('./data/digests');

digests.forEach(function([digest, valids, invalids]) {
  contract(digest, function(accounts) {
    const algorithm = artifacts.require('./digests/' + digest + '.sol');

    it('should return true for valid hashes', async function() {
      var instance = await algorithm.deployed();
      Promise.all(valids.forEach(async function([text, digest]) {
        assert.equal(await instance.verify(text, digest), true); // @todo need to convert foo to bytes
      }));
    });

    it('should return false for invalid hashes', async function() {
      var instance = await algorithm.deployed();
      Promise.all(invalids.forEach(async function([text, digest]) {
        assert.equal(await instance.verify(text, digest), false); // @todo need to convert foo to bytes
      }));
    });
  });
});
