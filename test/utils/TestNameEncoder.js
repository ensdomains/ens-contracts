const TestNameEncoder = artifacts.require('TestNameEncoder.sol')
const { dns } = require('../test-utils')

contract('UniversalResolver', function(accounts) {
  let testNameEncoder

  beforeEach(async () => {
    testNameEncoder = await TestNameEncoder.new()
  })

  describe('encodeName()', () => {
    it('should encode a name', async () => {
      const result = await testNameEncoder.encodeName('vitalik.eth')
      expect(result).to.equal(dns.hexEncodeName('vitalik.eth'))
    })

    it('should encode an empty name', async () => {
      const result = await testNameEncoder.encodeName('')
      expect(result).to.equal(dns.hexEncodeName(''))
    })

    it('should encode a long name', async () => {
      const result = await testNameEncoder.encodeName('something.else.test.eth')
      expect(result).to.equal(dns.hexEncodeName('something.else.test.eth'))
    })
  })
})
