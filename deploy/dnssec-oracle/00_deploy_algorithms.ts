import { deployScript } from '@rocketh'
import { Artifact_DummyAlgorithm } from 'generated/artifacts/DummyAlgorithm.js'
import { Artifact_P256SHA256Algorithm } from 'generated/artifacts/P256SHA256Algorithm.js'
import { Artifact_RSASHA1Algorithm } from 'generated/artifacts/RSASHA1Algorithm.js'
import { Artifact_RSASHA256Algorithm } from 'generated/artifacts/RSASHA256Algorithm.js'

export default deployScript(
  async ({ deploy, namedAccounts, tags }) => {
    const { deployer } = namedAccounts

    await deploy('RSASHA1Algorithm', {
      account: deployer,
      artifact: Artifact_RSASHA1Algorithm,
      args: [],
    })

    await deploy('RSASHA256Algorithm', {
      account: deployer,
      artifact: Artifact_RSASHA256Algorithm,
      args: [],
    })

    await deploy('P256SHA256Algorithm', {
      account: deployer,
      artifact: Artifact_P256SHA256Algorithm,
      args: [],
    })

    if (tags?.test) {
      await deploy('DummyAlgorithm', {
        account: deployer,
        artifact: Artifact_DummyAlgorithm,
        args: [],
      })
    }

    return true;
  },
  {
    id: 'dnssec-algorithms v1.0.0',
    tags: [
      'category:dnssec-oracle',
      'dnssec-algorithms',
      'RSASHA1Algorithm',
      'RSASHA256Algorithm',
      'P256SHA256Algorithm',
      'DummyAlgorithm',
    ],
    dependencies: [],
  },
)
