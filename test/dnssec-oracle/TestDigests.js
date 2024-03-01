const digests = require('./data/digests')
const { expect, contract, ethers, artifacts } = require('hardhat')
digests.forEach(function (testcase) {
  contract(testcase.digest, function (accounts) {
    const algorithm = artifacts.require('./digests/' + testcase.digest + '.sol')

    it('should return true for valid hashes', async function () {
      var instance = await algorithm.deployed()
      await Promise.all(
        testcase.valids.map(async function ([text, digest]) {
          assert.equal(
            await instance.verify(
              ethers.hexlify(ethers.toUtf8Bytes(text)),
              digest,
            ),
            true,
          )
        }),
      )
    })

    it('should return false for invalid hashes', async function () {
      var instance = await algorithm.deployed()
      await Promise.all(
        testcase.invalids.map(async function ([text, digest]) {
          assert.equal(
            await instance.verify(
              ethers.hexlify(ethers.toUtf8Bytes(text)),
              digest,
            ),
            false,
          )
        }),
      )
    })

    it.only('should throw an error for hashes of the wrong form', async function () {
      var instance = await algorithm.deployed()
      await Promise.all(
        testcase.errors.map(async function ([text, digest]) {
          await expect(
            instance.verify(ethers.hexlify(ethers.toUtf8Bytes(text)), digest),
          ).to.be.reverted
        }),
      )
    })
  })
})
