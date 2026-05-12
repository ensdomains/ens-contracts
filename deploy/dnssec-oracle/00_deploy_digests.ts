import { artifacts, deployScript } from '@rocketh'

export default deployScript(
  async ({ deploy, namedAccounts, network }) => {
    const { deployer } = namedAccounts

    await deploy('SHA1Digest', {
      account: deployer,
      artifact: artifacts.SHA1Digest,
      args: [],
    })

    await deploy('SHA256Digest', {
      account: deployer,
      artifact: artifacts.SHA256Digest,
      args: [],
    })

    if (network.tags?.test) {
      await deploy('DummyDigest', {
        account: deployer,
        artifact: artifacts.DummyDigest,
        args: [],
      })
    }
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
