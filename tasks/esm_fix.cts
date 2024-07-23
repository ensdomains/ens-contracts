import fs = require('fs/promises')
import task_names = require('hardhat/builtin-tasks/task-names')
import config = require('hardhat/config')
import path = require('path')

config
  .subtask(task_names.TASK_COMPILE_SOLIDITY)
  .setAction(async (_, { config }, runSuper) => {
    const superRes = await runSuper()

    try {
      await fs.writeFile(
        path.join(config.paths.artifacts, 'package.json'),
        '{ "type": "commonjs" }',
      )
    } catch (error) {
      console.error('Error writing package.json: ', error)
    }

    return superRes
  })
