const digests = require('./data/digests');

digests.forEach(function([digest, valid, valid2, invalid]) {
  contract(digest, function(accounts) {
    const algorithm = artifacts.require('./digests/' + digest + '.sol');

    it('should return true for valid hashes', async function() {
      var instance = await algorithm.deployed();
      assert.equal(await instance.verify(valid[0], valid[1]), true); // @todo need to convert foo to bytes
    });

    it('should return false for invalid hashes', async function() {
      var instance = await algorithm.deployed();
      assert.equal(await instance.verify(invalid[0], invalid[1]), false);
    });
  });
});
