import { getAddress, zeroAddress, zeroHash } from 'viem'
const ReverseRecord = {
  ethereum: 1,
  default: 2,
}
export const getDefaultRegistrationOptionsWithConnection =
  (connection) =>
  async ({
    label,
    ownerAddress,
    duration,
    secret,
    resolverAddress,
    data,
    reverseRecord,
    referrer,
  }) => ({
    label,
    ownerAddress: await (async () => {
      if (ownerAddress) return getAddress(ownerAddress)
      const [deployer] = await connection.viem.getWalletClients()
      return getAddress(deployer.account.address)
    })(),
    duration: duration ?? BigInt(60 * 60 * 24 * 365),
    secret:
      secret ??
      '0x0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF',
    resolverAddress: resolverAddress ?? zeroAddress,
    data: data ?? [],
    reverseRecord: reverseRecord ?? [],
    referrer: referrer ?? zeroHash,
  })
export const getRegisterNameParameters = ({
  label,
  ownerAddress,
  duration,
  secret,
  resolverAddress,
  data,
  reverseRecord,
  referrer,
}) => {
  const immutable = {
    label,
    owner: ownerAddress,
    duration,
    secret,
    resolver: resolverAddress,
    data,
    reverseRecord: reverseRecord.reduce(
      (acc, record) => acc | ReverseRecord[record],
      0,
    ),
    referrer,
  }
  return immutable
}
export const commitNameWithConnection =
  (connection) =>
  async ({ ethRegistrarController }, params_) => {
    const params = await getDefaultRegistrationOptionsWithConnection(
      connection,
    )(params_)
    const args = getRegisterNameParameters(params)
    const testClient = await connection.viem.getTestClient()
    const [deployer] = await connection.viem.getWalletClients()
    const commitmentHash = await ethRegistrarController.read.makeCommitment([
      args,
    ])
    await ethRegistrarController.write.commit([commitmentHash], {
      account: deployer.account,
    })
    const minCommitmentAge =
      await ethRegistrarController.read.minCommitmentAge()
    await testClient.increaseTime({ seconds: Number(minCommitmentAge) })
    await testClient.mine({ blocks: 1 })
    return {
      params,
      args,
      hash: commitmentHash,
    }
  }
export const registerNameWithConnection =
  (connection) =>
  async ({ ethRegistrarController }, params_) => {
    const params = await getDefaultRegistrationOptionsWithConnection(
      connection,
    )(params_)
    const args = getRegisterNameParameters(params)
    const { label, duration } = params
    const testClient = await connection.viem.getTestClient()
    const [deployer] = await connection.viem.getWalletClients()
    const commitmentHash = await ethRegistrarController.read.makeCommitment([
      args,
    ])
    await ethRegistrarController.write.commit([commitmentHash], {
      account: deployer.account,
    })
    const minCommitmentAge =
      await ethRegistrarController.read.minCommitmentAge()
    await testClient.increaseTime({ seconds: Number(minCommitmentAge) })
    await testClient.mine({ blocks: 1 })
    const price = await ethRegistrarController.read.rentPrice([label, duration])
    const value = price.base + price.premium
    await ethRegistrarController.write.register([args], {
      value,
      account: deployer.account,
    })
  }
