import { deployScript } from '@rocketh'
import { Artifact_DummyDigest } from 'generated/artifacts/DummyDigest.js'
import { Artifact_SHA1Digest } from 'generated/artifacts/SHA1Digest.js'
import { Artifact_SHA256Digest } from 'generated/artifacts/SHA256Digest.js'

export default deployScript(
  async ({ deploy, namedAccounts, tags }) => {
    const { deployer } = namedAccounts

    await deploy('SHA1Digest', {
      account: deployer,
      artifact: Artifact_SHA1Digest,
      args: [],
    })

    await deploy('SHA256Digest', {
      account: deployer,
      artifact: Artifact_SHA256Digest,
      args: [],
    })

    if (tags?.test) {
      await deploy('DummyDigest', {
        account: deployer,
        artifact: Artifact_DummyDigest,
        args: [],
      })
    }

    return true;
  },
  {
    id: 'dnssec-digests v1.0.0',
    tags: [
      'category:dnssec-oracle',
      'dnssec-digests',
      'SHA1Digest',
      'SHA256Digest',
      'DummyDigest',
    ],
  },
)
