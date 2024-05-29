import { loadFixture } from '@nomicfoundation/hardhat-toolbox-viem/network-helpers.js'
import { zeroAddress } from 'viem'
import { DAY, FUSES } from '../fixtures/constants.js'
import { toLabelId, toNameId } from '../fixtures/utils.js'
import { shouldRespectConstraints } from './Constraints.behaviour.js'
import { shouldBehaveLikeErc1155 } from './ERC1155.behaviour.js'
import { shouldSupportInterfaces } from './SupportsInterface.behaviour.js'
import { deployNameWrapperFixture } from './fixtures/deploy.js'

describe('NameWrapper', () => {
  shouldSupportInterfaces({
    contract: () =>
      loadFixture(deployNameWrapperFixture).then(
        ({ nameWrapper }) => nameWrapper,
      ),
    interfaces: ['INameWrapper', 'IERC721Receiver'],
  })

  shouldBehaveLikeErc1155({
    contracts: () =>
      loadFixture(deployNameWrapperFixture).then((contracts) => ({
        contract: contracts.nameWrapper,
        ...contracts,
      })),
    targetTokenIds: [
      toNameId('test1.eth'),
      toNameId('test2.eth'),
      toNameId('doesnotexist.eth'),
    ],
    mint: async (
      { nameWrapper, baseRegistrar, accounts },
      [firstTokenHolder, secondTokenHolder],
    ) => {
      await baseRegistrar.write.setApprovalForAll([nameWrapper.address, true])
      await baseRegistrar.write.register([
        toLabelId('test1'),
        accounts[0].address,
        1n * DAY,
      ])
      await nameWrapper.write.wrapETH2LD([
        'test1',
        firstTokenHolder,
        FUSES.CAN_DO_EVERYTHING,
        zeroAddress,
      ])

      await baseRegistrar.write.register([
        toLabelId('test2'),
        accounts[0].address,
        1n * DAY,
      ])
      await nameWrapper.write.wrapETH2LD([
        'test2',
        secondTokenHolder,
        FUSES.CAN_DO_EVERYTHING,
        zeroAddress,
      ])
    },
  })

  shouldRespectConstraints()
})
