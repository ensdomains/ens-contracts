// scan through the /build/contracts directory and require all of the contracts
// and add them to the module.exports object, then write the module.exports object
// to a file called index.js.

const fs = require('fs')
const path = require('path')

const contractsDir = path.join(__dirname, '../', 'build', 'contracts')

const contracts = fs
  .readdirSync(contractsDir)
  .map((file) => file.replace('.json', ''))

const indexFile =
  contracts
    .map(
      (contract) =>
        `const ${contract} = require('./build/contracts/${contract}')`,
    )
    .join('\n') +
  '\n\nmodule.exports = {\n' +
  contracts.map((contract) => `  ${contract}`).join(',\n') +
  '\n}'

fs.writeFileSync(path.join(__dirname, '../', 'index.js'), indexFile)

console.log('index.js created')
