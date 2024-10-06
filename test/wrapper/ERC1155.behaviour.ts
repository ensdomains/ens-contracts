import { loadFixture } from '@nomicfoundation/hardhat-toolbox-viem/network-helpers.js'
import { GetContractReturnType } from '@nomicfoundation/hardhat-viem/types.js'
import { expect } from 'chai'
import hre from 'hardhat'
import type { ArtifactsMap } from 'hardhat/types/artifacts.js'
import {
  zeroAddress,
  type Abi,
  type Account,
  type Address,
  type Hash,
  type Hex,
} from 'viem'
import { shouldSupportInterfaces } from './SupportsInterface.behaviour.js'

const RECEIVER_SINGLE_MAGIC_VALUE = '0xf23a6e61'
const RECEIVER_BATCH_MAGIC_VALUE = '0xbc197c81'

type ERC1155Abi = ArtifactsMap['IERC1155']['abi']
type ERC1155Contract = GetContractReturnType<ERC1155Abi>

const getNamedAccounts = ([
  minter,
  firstTokenHolder,
  secondTokenHolder,
  multiTokenHolder,
  recipient,
  proxy,
]: Account[]) => ({
  minter,
  firstTokenHolder,
  secondTokenHolder,
  multiTokenHolder,
  recipient,
  proxy,
})

export const shouldBehaveLikeErc1155 = <
  TContract extends {
    abi: Abi
    address: Address
    read: ERC1155Contract['read']
    write: ERC1155Contract['write']
  },
  TContracts extends { contract: TContract; accounts: Account[] },
>({
  contracts: contracts_,
  targetTokenIds: [firstTokenId, secondTokenId, unknownTokenId],
  mint: mint_,
}: {
  contracts: () => Promise<TContracts>
  targetTokenIds: [bigint, bigint, bigint] | readonly [bigint, bigint, bigint]
  mint: (
    contracts: NoInfer<TContracts>,
    addresses: [firstTokenHolder: Address, secondTokenHolder: Address],
  ) => Promise<void>
}) => {
  const contracts = async () => {
    const contractsObject = await contracts_()
    return {
      ...getNamedAccounts(contractsObject.accounts),
      ...(contractsObject as Omit<TContracts, 'contract'>),
      mint: (
        addresses: [firstTokenHolder: Address, secondTokenHolder: Address],
      ) => mint_(contractsObject, addresses),
      contract: contractsObject.contract as unknown as ERC1155Contract,
    }
  }
  type ContractsObject = ReturnType<typeof getNamedAccounts> &
    Omit<TContracts, 'contract'> & {
      mint: (
        addresses: [firstTokenHolder: Address, secondTokenHolder: Address],
      ) => Promise<void>
      contract: ERC1155Contract
    }

  describe('like an ERC1155', () => {
    describe('balanceOf', () => {
      it('reverts when queried about the zero address', async () => {
        const { contract } = await contracts()
        await expect(contract)
          .read('balanceOf', [zeroAddress, firstTokenId])
          .toBeRevertedWithString('ERC1155: balance query for the zero address')
      })

      context("when accounts don't own tokens", () => {
        it('returns zero for given addresses', async () => {
          const { contract, firstTokenHolder, secondTokenHolder } =
            await contracts()

          await expect(
            contract.read.balanceOf([firstTokenHolder.address, firstTokenId]),
          ).resolves.toEqual(0n)
          await expect(
            contract.read.balanceOf([secondTokenHolder.address, secondTokenId]),
          ).resolves.toEqual(0n)
          await expect(
            contract.read.balanceOf([firstTokenHolder.address, unknownTokenId]),
          ).resolves.toEqual(0n)
        })
      })

      context('when accounts own some tokens', () => {
        it('returns the amount of tokens owned by the given addresses', async () => {
          const { contract, mint, firstTokenHolder, secondTokenHolder } =
            await contracts()

          await mint([firstTokenHolder.address, secondTokenHolder.address])

          await expect(
            contract.read.balanceOf([firstTokenHolder.address, firstTokenId]),
          ).resolves.toEqual(1n)
          await expect(
            contract.read.balanceOf([secondTokenHolder.address, secondTokenId]),
          ).resolves.toEqual(1n)
          await expect(
            contract.read.balanceOf([firstTokenHolder.address, unknownTokenId]),
          ).resolves.toEqual(0n)
        })
      })
    })

    describe('balanceOfBatch', () => {
      it("reverts when input arrays don't match up", async () => {
        const { contract, firstTokenHolder, secondTokenHolder } =
          await contracts()

        await expect(contract)
          .read('balanceOfBatch', [
            [
              firstTokenHolder.address,
              secondTokenHolder.address,
              firstTokenHolder.address,
              secondTokenHolder.address,
            ],
            [firstTokenId, secondTokenId, unknownTokenId],
          ])
          .toBeRevertedWithString('ERC1155: accounts and ids length mismatch')

        await expect(contract)
          .read('balanceOfBatch', [
            [firstTokenHolder.address, secondTokenHolder.address],
            [firstTokenId, secondTokenId, unknownTokenId],
          ])
          .toBeRevertedWithString('ERC1155: accounts and ids length mismatch')
      })

      it('reverts when one of the addresses is the zero address', async () => {
        const { contract, firstTokenHolder, secondTokenHolder } =
          await contracts()

        await expect(contract)
          .read('balanceOfBatch', [
            [firstTokenHolder.address, secondTokenHolder.address, zeroAddress],
            [firstTokenId, secondTokenId, unknownTokenId],
          ])
          .toBeRevertedWithString('ERC1155: balance query for the zero address')
      })

      context("when accounts don't own tokens", () => {
        it('returns zeros for each account', async () => {
          const { contract, firstTokenHolder, secondTokenHolder } =
            await contracts()

          await expect(
            contract.read.balanceOfBatch([
              [
                firstTokenHolder.address,
                secondTokenHolder.address,
                firstTokenHolder.address,
              ],
              [firstTokenId, secondTokenId, unknownTokenId],
            ]),
          ).resolves.toMatchObject([0n, 0n, 0n])
        })
      })

      context('when accounts own some tokens', () => {
        it('returns amounts owned by each account in order passed', async () => {
          const { contract, mint, firstTokenHolder, secondTokenHolder } =
            await contracts()

          await mint([firstTokenHolder.address, secondTokenHolder.address])

          await expect(
            contract.read.balanceOfBatch([
              [
                secondTokenHolder.address,
                firstTokenHolder.address,
                firstTokenHolder.address,
              ],
              [secondTokenId, firstTokenId, unknownTokenId],
            ]),
          ).resolves.toMatchObject([1n, 1n, 0n])
        })

        it('returns multiple times the balance of the same address when asked', async () => {
          const { contract, mint, firstTokenHolder, secondTokenHolder } =
            await contracts()

          await mint([firstTokenHolder.address, secondTokenHolder.address])

          await expect(
            contract.read.balanceOfBatch([
              [
                firstTokenHolder.address,
                secondTokenHolder.address,
                firstTokenHolder.address,
              ],
              [firstTokenId, secondTokenId, firstTokenId],
            ]),
          ).resolves.toMatchObject([1n, 1n, 1n])
        })
      })
    })

    describe('setApprovalForAll', () => {
      it('sets approval status which can be queried via isApprovedForAll', async () => {
        const { contract, multiTokenHolder, proxy } = await contracts()

        await contract.write.setApprovalForAll([proxy.address, true], {
          account: multiTokenHolder,
        })

        await expect(
          contract.read.isApprovedForAll([
            multiTokenHolder.address,
            proxy.address,
          ]),
        ).resolves.toBe(true)
      })

      it('emits an ApprovalForAll log', async () => {
        const { contract, multiTokenHolder, proxy } = await contracts()

        await expect(contract)
          .write('setApprovalForAll', [proxy.address, true], {
            account: multiTokenHolder,
          })
          .toEmitEvent('ApprovalForAll')
          .withArgs(multiTokenHolder.address, proxy.address, true)
      })

      it('can unset approval for an operator', async () => {
        const { contract, multiTokenHolder, proxy } = await contracts()

        await contract.write.setApprovalForAll([proxy.address, true], {
          account: multiTokenHolder,
        })
        await contract.write.setApprovalForAll([proxy.address, false], {
          account: multiTokenHolder,
        })

        await expect(
          contract.read.isApprovedForAll([
            multiTokenHolder.address,
            proxy.address,
          ]),
        ).resolves.toBe(false)
      })

      it('reverts if attempting to approve self as an operator', async () => {
        const { contract, multiTokenHolder } = await contracts()

        await expect(contract)
          .write('setApprovalForAll', [multiTokenHolder.address, true], {
            account: multiTokenHolder,
          })
          .toBeRevertedWithString('ERC1155: setting approval status for self')
      })
    })

    async function mintedToMultiFixture() {
      const initial = await contracts()
      await initial.mint([
        initial.multiTokenHolder.address,
        initial.multiTokenHolder.address,
      ])
      return initial
    }

    describe('safeTransferFrom', () => {
      it('reverts when transferring more than balance', async () => {
        const { contract, multiTokenHolder, recipient } = await loadFixture(
          mintedToMultiFixture,
        )

        await expect(contract)
          .write(
            'safeTransferFrom',
            [
              multiTokenHolder.address,
              recipient.address,
              firstTokenId,
              2n,
              '0x',
            ],
            { account: multiTokenHolder },
          )
          .toBeRevertedWithString('ERC1155: insufficient balance for transfer')
      })

      it('reverts when transferring to zero address', async () => {
        const { contract, multiTokenHolder } = await loadFixture(
          mintedToMultiFixture,
        )

        await expect(contract)
          .write(
            'safeTransferFrom',
            [multiTokenHolder.address, zeroAddress, firstTokenId, 1n, '0x'],
            { account: multiTokenHolder },
          )
          .toBeRevertedWithString('ERC1155: transfer to the zero address')
      })

      const transferWasSuccessful = (
        fixture: () => Promise<
          ContractsObject & {
            operator: Account
            from: Account
            to: { address: Address }
            id: bigint
            value: bigint
            tx: Hash
          }
        >,
      ) => {
        it('debits transferred balance from sender', async () => {
          const { contract, from, id } = await loadFixture(fixture)

          await expect(
            contract.read.balanceOf([from.address, id]),
          ).resolves.toEqual(0n)
        })

        it('credits transferred balance to receiver', async () => {
          const { contract, to, id, value } = await loadFixture(fixture)

          await expect(
            contract.read.balanceOf([to.address, id]),
          ).resolves.toEqual(value)
        })

        it('emits a TransferSingle log', async () => {
          const { contract, operator, from, to, tx, id, value } =
            await loadFixture(fixture)

          await expect(contract)
            .transaction(tx)
            .toEmitEvent('TransferSingle')
            .withArgs(operator.address, from.address, to.address, id, value)
        })
      }

      context('when called by the multiTokenHolder', () => {
        async function fixture() {
          const contractsObject = await loadFixture(mintedToMultiFixture)
          const { contract, multiTokenHolder, recipient } = contractsObject
          const operator = multiTokenHolder
          const from = multiTokenHolder
          const to = recipient
          const id = firstTokenId
          const value = 1n

          const tx = await contract.write.safeTransferFrom(
            [from.address, to.address, id, value, '0x'],
            { account: operator },
          )

          return { ...contractsObject, operator, from, to, id, value, tx }
        }

        transferWasSuccessful(fixture)

        it('preserves existing balances which are not transferred by multiTokenHolder', async () => {
          const { contract, multiTokenHolder, recipient } = await loadFixture(
            fixture,
          )

          await expect(
            contract.read.balanceOf([multiTokenHolder.address, secondTokenId]),
          ).resolves.toEqual(1n)
          await expect(
            contract.read.balanceOf([recipient.address, secondTokenId]),
          ).resolves.toEqual(0n)
        })
      })

      context(
        'when called by an operator on behalf of the multiTokenHolder',
        () => {
          context('when operator is not approved by multiTokenHolder', () => {
            it('reverts', async () => {
              const { contract, multiTokenHolder, recipient, proxy } =
                await loadFixture(mintedToMultiFixture)

              await expect(contract)
                .write(
                  'safeTransferFrom',
                  [
                    multiTokenHolder.address,
                    recipient.address,
                    firstTokenId,
                    1n,
                    '0x',
                  ],
                  { account: proxy },
                )
                .toBeRevertedWithString(
                  'ERC1155: caller is not owner nor approved',
                )
            })
          })

          context('when operator is approved by multiTokenHolder', () => {
            async function fixture() {
              const contractsObject = await loadFixture(mintedToMultiFixture)
              const { contract, multiTokenHolder, proxy, recipient } =
                contractsObject
              const operator = proxy
              const from = multiTokenHolder
              const to = recipient
              const id = firstTokenId
              const value = 1n

              await contract.write.setApprovalForAll([operator.address, true], {
                account: from,
              })

              const tx = await contract.write.safeTransferFrom(
                [from.address, to.address, id, value, '0x'],
                { account: operator },
              )

              return { ...contractsObject, operator, from, to, id, value, tx }
            }

            transferWasSuccessful(fixture)

            it("preserves operator's balances not involved in the transfer", async () => {
              const { contract, proxy } = await loadFixture(fixture)
              await expect(
                contract.read.balanceOf([proxy.address, firstTokenId]),
              ).resolves.toEqual(0n)
              await expect(
                contract.read.balanceOf([proxy.address, secondTokenId]),
              ).resolves.toEqual(0n)
            })
          })
        },
      )

      context('when sending to a valid receiver', () => {
        const createValidReceiverFixture = (data: Hex) =>
          async function contractsWithReceiver() {
            const contractsObject = await loadFixture(mintedToMultiFixture)
            const receiver = await hre.viem.deployContract(
              'ERC1155ReceiverMock',
              [
                RECEIVER_SINGLE_MAGIC_VALUE,
                false,
                RECEIVER_BATCH_MAGIC_VALUE,
                false,
              ],
            )

            const { contract, multiTokenHolder } = contractsObject
            const operator = multiTokenHolder
            const from = multiTokenHolder
            const to = receiver
            const id = firstTokenId
            const value = 1n

            const tx = await contract.write.safeTransferFrom(
              [from.address, to.address, id, value, data],
              { account: operator },
            )

            return {
              ...contractsObject,
              receiver,
              operator,
              from,
              to,
              id,
              value,
              tx,
            }
          }

        context('without data', () => {
          const fixture = createValidReceiverFixture('0x')

          transferWasSuccessful(fixture)

          it('calls onERC1155Received', async () => {
            const { contract, receiver, multiTokenHolder, tx } =
              await loadFixture(fixture)

            await expect(contract)
              .transaction(tx)
              .toEmitEventFrom(receiver, 'Received')
              .withArgs(
                multiTokenHolder.address,
                multiTokenHolder.address,
                firstTokenId,
                1n,
                '0x',
              )
          })
        })

        context('with data', () => {
          const data = '0xf00dd00d'
          const fixture = createValidReceiverFixture(data)

          transferWasSuccessful(fixture)

          it('calls onERC1155Received', async () => {
            const { contract, receiver, multiTokenHolder, tx } =
              await loadFixture(fixture)

            await expect(contract)
              .transaction(tx)
              .toEmitEventFrom(receiver, 'Received')
              .withArgs(
                multiTokenHolder.address,
                multiTokenHolder.address,
                firstTokenId,
                1n,
                data,
              )
          })
        })
      })

      context('to a receiver contract returning unexpected value', () => {
        it('reverts', async () => {
          const { contract, multiTokenHolder } = await loadFixture(
            mintedToMultiFixture,
          )

          const receiver = await hre.viem.deployContract(
            'ERC1155ReceiverMock',
            ['0x00c0ffee', false, RECEIVER_BATCH_MAGIC_VALUE, false],
          )

          await expect(contract)
            .write(
              'safeTransferFrom',
              [
                multiTokenHolder.address,
                receiver.address,
                firstTokenId,
                1n,
                '0x',
              ],
              { account: multiTokenHolder },
            )
            .toBeRevertedWithString('ERC1155: ERC1155Receiver rejected tokens')
        })
      })

      context('to a receiver that reverts', () => {
        it('reverts', async () => {
          const { contract, multiTokenHolder } = await loadFixture(
            mintedToMultiFixture,
          )

          const receiver = await hre.viem.deployContract(
            'ERC1155ReceiverMock',
            [
              RECEIVER_SINGLE_MAGIC_VALUE,
              true,
              RECEIVER_BATCH_MAGIC_VALUE,
              false,
            ],
          )

          await expect(contract)
            .write(
              'safeTransferFrom',
              [
                multiTokenHolder.address,
                receiver.address,
                firstTokenId,
                1n,
                '0x',
              ],
              { account: multiTokenHolder },
            )
            .toBeRevertedWithString('ERC1155ReceiverMock: reverting on receive')
        })
      })

      context(
        'to a contract that does not implement the required function',
        () => {
          it('reverts', async () => {
            const { contract, multiTokenHolder } = await loadFixture(
              mintedToMultiFixture,
            )

            const receiver = contract

            await expect(contract)
              .write(
                'safeTransferFrom',
                [
                  multiTokenHolder.address,
                  receiver.address,
                  firstTokenId,
                  1n,
                  '0x',
                ],
                { account: multiTokenHolder },
              )
              .toBeRevertedWithString(
                'ERC1155: transfer to non ERC1155Receiver implementer',
              )
          })
        },
      )
    })

    describe('safeBatchTransferFrom', () => {
      it('reverts when transferring amount more than any of balances', async () => {
        const { contract, multiTokenHolder, recipient } = await loadFixture(
          mintedToMultiFixture,
        )

        await expect(contract)
          .write(
            'safeBatchTransferFrom',
            [
              multiTokenHolder.address,
              recipient.address,
              [firstTokenId, secondTokenId],
              [1n, 2n],
              '0x',
            ],
            { account: multiTokenHolder },
          )
          .toBeRevertedWithString('ERC1155: insufficient balance for transfer')
      })

      it("reverts when ids array length doesn't match amounts array length", async () => {
        const { contract, multiTokenHolder, recipient } = await loadFixture(
          mintedToMultiFixture,
        )

        await expect(contract)
          .write(
            'safeBatchTransferFrom',
            [
              multiTokenHolder.address,
              recipient.address,
              [firstTokenId],
              [1n, 1n],
              '0x',
            ],
            { account: multiTokenHolder },
          )
          .toBeRevertedWithString('ERC1155: ids and amounts length mismatch')

        await expect(contract)
          .write(
            'safeBatchTransferFrom',
            [
              multiTokenHolder.address,
              recipient.address,
              [firstTokenId, secondTokenId],
              [1n],
              '0x',
            ],
            { account: multiTokenHolder },
          )
          .toBeRevertedWithString('ERC1155: ids and amounts length mismatch')
      })

      it('reverts when transferring to zero address', async () => {
        const { contract, multiTokenHolder } = await loadFixture(
          mintedToMultiFixture,
        )

        await expect(contract)
          .write(
            'safeBatchTransferFrom',
            [
              multiTokenHolder.address,
              zeroAddress,
              [firstTokenId, secondTokenId],
              [1n, 1n],
              '0x',
            ],
            { account: multiTokenHolder },
          )
          .toBeRevertedWithString('ERC1155: transfer to the zero address')
      })

      const batchTransferWasSuccessful = (
        fixture: () => Promise<
          ContractsObject & {
            operator: Account
            from: Account
            to: { address: Address }
            ids: bigint[]
            values: bigint[]
            tx: Hash
          }
        >,
      ) => {
        it('debits transferred balance from sender', async () => {
          const { contract, from, ids } = await loadFixture(fixture)

          await expect(
            contract.read.balanceOfBatch([
              new Array(ids.length).fill(from.address),
              ids,
            ]),
          ).resolves.toEqual(new Array(ids.length).fill(0n))
        })

        it('credits transferred balance to receiver', async () => {
          const { contract, to, ids, values } = await loadFixture(fixture)

          await expect(
            contract.read.balanceOfBatch([
              new Array(ids.length).fill(to.address),
              ids,
            ]),
          ).resolves.toEqual(values)
        })

        it('emits a TransferSingle log', async () => {
          const { contract, operator, from, to, tx, ids, values } =
            await loadFixture(fixture)

          await expect(contract)
            .transaction(tx)
            .toEmitEvent('TransferBatch')
            .withArgs(operator.address, from.address, to.address, ids, values)
        })
      }

      context('when called by the multiTokenHolder', () => {
        async function fixture() {
          const contractsObject = await loadFixture(mintedToMultiFixture)
          const { contract, multiTokenHolder, recipient } = contractsObject
          const operator = multiTokenHolder
          const from = multiTokenHolder
          const to = recipient
          const ids = [firstTokenId, secondTokenId]
          const values = [1n, 1n]

          const tx = await contract.write.safeBatchTransferFrom(
            [from.address, to.address, ids, values, '0x'],
            { account: operator },
          )

          return { ...contractsObject, operator, from, to, ids, values, tx }
        }

        batchTransferWasSuccessful(fixture)
      })

      context(
        'when called by an operator on behalf of the multiTokenHolder',
        () => {
          context('when operator is not approved by multiTokenHolder', () => {
            it('reverts', async () => {
              const { contract, multiTokenHolder, recipient, proxy } =
                await loadFixture(mintedToMultiFixture)

              await expect(contract)
                .write(
                  'safeBatchTransferFrom',
                  [
                    multiTokenHolder.address,
                    recipient.address,
                    [firstTokenId, secondTokenId],
                    [1n, 1n],
                    '0x',
                  ],
                  { account: proxy },
                )
                .toBeRevertedWithString(
                  'ERC1155: transfer caller is not owner nor approved',
                )
            })
          })

          context('when operator is approved by multiTokenHolder', () => {
            async function fixture() {
              const contractsObject = await loadFixture(mintedToMultiFixture)
              const { contract, multiTokenHolder, proxy, recipient } =
                contractsObject
              const operator = proxy
              const from = multiTokenHolder
              const to = recipient
              const ids = [firstTokenId, secondTokenId]
              const values = [1n, 1n]

              await contract.write.setApprovalForAll([operator.address, true], {
                account: from,
              })

              const tx = await contract.write.safeBatchTransferFrom(
                [from.address, to.address, ids, values, '0x'],
                { account: operator },
              )

              return { ...contractsObject, operator, from, to, ids, values, tx }
            }

            batchTransferWasSuccessful(fixture)

            it("preserves operator's balances not involved in the transfer", async () => {
              const { contract, proxy } = await loadFixture(fixture)
              await expect(
                contract.read.balanceOf([proxy.address, firstTokenId]),
              ).resolves.toEqual(0n)
              await expect(
                contract.read.balanceOf([proxy.address, secondTokenId]),
              ).resolves.toEqual(0n)
            })
          })
        },
      )

      context('when sending to a valid receiver', () => {
        const createValidReceiverFixture = (data: Hex) =>
          async function contractsWithReceiver() {
            const contractsObject = await loadFixture(mintedToMultiFixture)
            const receiver = await hre.viem.deployContract(
              'ERC1155ReceiverMock',
              [
                RECEIVER_SINGLE_MAGIC_VALUE,
                false,
                RECEIVER_BATCH_MAGIC_VALUE,
                false,
              ],
            )

            const { contract, multiTokenHolder } = contractsObject
            const operator = multiTokenHolder
            const from = multiTokenHolder
            const to = receiver
            const ids = [firstTokenId, secondTokenId]
            const values = [1n, 1n]

            const tx = await contract.write.safeBatchTransferFrom(
              [from.address, to.address, ids, values, data],
              { account: operator },
            )

            return {
              ...contractsObject,
              receiver,
              operator,
              from,
              to,
              ids,
              values,
              tx,
            }
          }

        context('without data', () => {
          const fixture = createValidReceiverFixture('0x')

          batchTransferWasSuccessful(fixture)

          it('calls onERC1155BatchReceived', async () => {
            const { contract, receiver, multiTokenHolder, tx } =
              await loadFixture(fixture)

            await expect(contract)
              .transaction(tx)
              .toEmitEventFrom(receiver, 'BatchReceived')
              .withArgs(
                multiTokenHolder.address,
                multiTokenHolder.address,
                [firstTokenId, secondTokenId],
                [1n, 1n],
                '0x',
              )
          })
        })

        context('with data', () => {
          const data = '0xf00dd00d'
          const fixture = createValidReceiverFixture(data)

          batchTransferWasSuccessful(fixture)

          it('calls onERC1155BatchReceived', async () => {
            const { contract, receiver, multiTokenHolder, tx } =
              await loadFixture(fixture)

            await expect(contract)
              .transaction(tx)
              .toEmitEventFrom(receiver, 'BatchReceived')
              .withArgs(
                multiTokenHolder.address,
                multiTokenHolder.address,
                [firstTokenId, secondTokenId],
                [1n, 1n],
                data,
              )
          })
        })
      })

      context('to a receiver contract returning unexpected value', () => {
        it('reverts', async () => {
          const { contract, multiTokenHolder } = await loadFixture(
            mintedToMultiFixture,
          )

          const receiver = await hre.viem.deployContract(
            'ERC1155ReceiverMock',
            [
              RECEIVER_SINGLE_MAGIC_VALUE,
              false,
              RECEIVER_SINGLE_MAGIC_VALUE,
              false,
            ],
          )

          await expect(contract)
            .write(
              'safeBatchTransferFrom',
              [
                multiTokenHolder.address,
                receiver.address,
                [firstTokenId, secondTokenId],
                [1n, 1n],
                '0x',
              ],
              { account: multiTokenHolder },
            )
            .toBeRevertedWithString('ERC1155: ERC1155Receiver rejected tokens')
        })
      })

      context('to a receiver contract that reverts', () => {
        it('reverts', async () => {
          const { contract, multiTokenHolder } = await loadFixture(
            mintedToMultiFixture,
          )

          const receiver = await hre.viem.deployContract(
            'ERC1155ReceiverMock',
            [
              RECEIVER_SINGLE_MAGIC_VALUE,
              false,
              RECEIVER_BATCH_MAGIC_VALUE,
              true,
            ],
          )

          await expect(contract)
            .write(
              'safeBatchTransferFrom',
              [
                multiTokenHolder.address,
                receiver.address,
                [firstTokenId, secondTokenId],
                [1n, 1n],
                '0x',
              ],
              { account: multiTokenHolder },
            )
            .toBeRevertedWithString(
              'ERC1155ReceiverMock: reverting on batch receive',
            )
        })
      })

      context(
        'to a receiver contract that reverts only on single transfers',
        () => {
          async function fixture() {
            const contractsObject = await loadFixture(mintedToMultiFixture)
            const receiver = await hre.viem.deployContract(
              'ERC1155ReceiverMock',
              [
                RECEIVER_SINGLE_MAGIC_VALUE,
                true,
                RECEIVER_BATCH_MAGIC_VALUE,
                false,
              ],
            )

            const { contract, multiTokenHolder } = contractsObject
            const operator = multiTokenHolder
            const from = multiTokenHolder
            const to = receiver
            const ids = [firstTokenId, secondTokenId]
            const values = [1n, 1n]

            const tx = await contract.write.safeBatchTransferFrom(
              [from.address, to.address, ids, values, '0x'],
              { account: operator },
            )

            return {
              ...contractsObject,
              receiver,
              operator,
              from,
              to,
              ids,
              values,
              tx,
            }
          }

          batchTransferWasSuccessful(fixture)

          it('calls onERC1155BatchReceived', async () => {
            const { contract, receiver, multiTokenHolder, tx } =
              await loadFixture(fixture)

            await expect(contract)
              .transaction(tx)
              .toEmitEventFrom(receiver, 'BatchReceived')
              .withArgs(
                multiTokenHolder.address,
                multiTokenHolder.address,
                [firstTokenId, secondTokenId],
                [1n, 1n],
                '0x',
              )
          })
        },
      )

      context(
        'to a contract that does not implement the required function',
        () => {
          it('reverts', async () => {
            const { contract, multiTokenHolder } = await loadFixture(
              mintedToMultiFixture,
            )

            const receiver = contract

            await expect(contract)
              .write(
                'safeBatchTransferFrom',
                [
                  multiTokenHolder.address,
                  receiver.address,
                  [firstTokenId, secondTokenId],
                  [1n, 1n],
                  '0x',
                ],
                { account: multiTokenHolder },
              )
              .toBeRevertedWithString(
                'ERC1155: transfer to non ERC1155Receiver implementer',
              )
          })
        },
      )
    })

    shouldSupportInterfaces({
      contract: () => contracts().then(({ contract }) => contract),
      interfaces: ['IERC165', 'IERC1155'],
    })
  })
}
