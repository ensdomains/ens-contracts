import hre from 'hardhat'

import { type Hex, namehash, parseEventLogs, zeroAddress } from 'viem'
import { dnssecFixture } from '../fixtures/dnssecFixture.js'
import { dnsEncodeName } from '../fixtures/dnsEncodeName.js'

// $ TEST_REMOTE=1 bun run test test/dnsregistrar/TestDNSRegistrar.remote.test.ts

const connection = await hre.network.connect('mainnetFork')

async function fixture() {
  const oldRegistrar = await connection.viem.getContractAt(
    'DNSRegistrar',
    '0xB32cB5677a7C971689228EC835800432B339bA2B',
  )
  const [pslAddress, ensAddress] = await Promise.all([
    oldRegistrar.read.suffixes(),
    oldRegistrar.read.ens(),
  ])
  const { dnssec } = await dnssecFixture(connection)
  const newRegistrar = await connection.viem.deployContract('DNSRegistrar', [
    [oldRegistrar.address],
    zeroAddress,
    dnssec.address,
    pslAddress,
    ensAddress,
  ])
  const ensRegistry = await connection.viem.getContractAt(
    'ENSRegistry',
    ensAddress,
  )
  const testClient = await connection.viem.getTestClient()
  const rootAddress = await ensRegistry.read.owner([namehash('')])
  const root = await connection.viem.getContractAt('Root', rootAddress, {
    client: { wallet: testClient as any },
  })
  const ownerAddress = await root.read.owner()
  await testClient.impersonateAccount({ address: ownerAddress })
  await root.write.setController([newRegistrar.address, true], {
    account: { address: ownerAddress, type: 'json-rpc' },
  })
  await testClient.stopImpersonatingAccount({ address: ownerAddress })
  return { oldRegistrar, newRegistrar, testClient }
}

const loadFixture = async () => connection.networkHelpers.loadFixture(fixture)

describe('DNSRegistrar (Remote)', () => {
  // names imported before inceptions were stored
  describe('legacy inceptions', () => {
    const NAMES: string[] = ['antistupid.com', 'ordinals.market']
    for (const name of NAMES) {
      it(name, async () => {
        const F = await loadFixture()
        await expect(
          F.oldRegistrar.read.inceptions([namehash(name)]),
          'old',
        ).resolves.toStrictEqual(0)
        await expect(
          F.newRegistrar.read.getInception([dnsEncodeName(`_ens.${name}`), 16]),
          'new',
        ).resolves.toStrictEqual(0)
      })
    }
  })

  // names imported after inceptions were stored
  describe('fallback inceptions', () => {
    const IMPORTS: { name: string; inception: number }[] = [
      { name: 'cyberjoker.com', inception: 1787788800 },
      { name: 'allbutai.online', inception: 1788407249 },
      { name: 'bishop.dev', inception: 1726236925 },
    ]
    for (const x of IMPORTS) {
      it(x.name, async () => {
        const F = await loadFixture()
        await expect(
          F.oldRegistrar.read.inceptions([namehash(x.name)]),
          'old',
        ).resolves.toStrictEqual(x.inception)
        await expect(
          F.newRegistrar.read.getInception([
            dnsEncodeName(`_ens.${x.name}`),
            16,
          ]),
          'new',
        ).resolves.toStrictEqual(x.inception)
      })
    }
  })

  // names imported and not expired
  describe('replay claims', () => {
    const CLAIMS: {
      name: string
      rrsets: { rrset: Hex; sig: Hex }[]
      events: { eventName: string; args: object; topics: Hex[]; data: Hex }[]
    }[] = [
      {
        name: 'clinicalagent.io',
        rrsets: [
          {
            rrset:
              '0x003008000002a3006abc51006aa0a1804f660000003000010002a30001080100030803010001e0980fa67b5962952deb96828c0a3fede0f86b357272caabb6b709a431429bfc6dfb85548d169c6df7a9a487fccc3d2018227eb7737f85d8fc340b9f2049f4c7da3b2016b8468499827e1903e2c1555fb2d1b0480d4c71f14952db5382ad87baeef8280461b40f303e8fcddd7732610b4d873faa08ce4d05bdde731fe76b0eac61a6fd2f14ba7f6714d2ad37fbe04fe4ab3451e7fc58909aff58b309813ebcc930a25b55fad10d6b78695e267b8e57bfc5d81a66b3e2e591a6c8b548df88355d562b365b0209398dbc54087f35b949315016c4298b3733c859fdaf72f34b1c4f08dc1d9421bce1b111d0199dc2a6c5e936a7bfe17130e6afada8648f8c08cb9900003000010002a30001080101030803010001acffb409bcc939f831f7a1e5ec88f7a59255ec53040be432027390a4ce896d6f9086f3c5e177fbfe118163aaec7af1462c47945944c4e2c026be5e98bbcded25978272e1e3e079c5094d573f0e83c92f02b32d3513b1550b826929c80dd0f92cac966d17769fd5867b647c3f38029abdc48152eb8f207159ecc5d232c7c1537c79f4b7ac28ff11682f21681bf6d6aba555032bf6f9f036beb2aaa5b3778d6eebfba6bf9ea191be4ab0caea759e2f773a1f9029c73ecb8d5735b9321db085f1b8e2d8038fe2941992548cee0d67dd4547e11dd63af9c9fc1c5466fb684cf009d7197c2cf79e792ab501e6a8a1ca519af2cb9b5f6367e94c0d47502451357be1b500003000010002a30001080101030803010001af7a8deba49d995a792aefc80263e991efdbc86138a931deb2c65d5682eab5d3b03738e3dfdc89d96da64c86c0224d9ce02514d285da3068b19054e5e787b2969058e98e12566c8c808c40c0b769e1db1a24a1bd9b31e303184a31fc7bb56b85bbba8abc02cd5040a444a36d47695969849e16ad856bb58e8fac8855224400319bdab224d83fc0e66aab32ff74bfeaf0f91c454e6850a1295207bbd4cdde8f6ffb08faa9755c2e3284efa01f99393e18786cb132f1e66ebc6517318e1ce8a3b7337ebb54d035ab57d9706ecd9350d4afacd825e43c8668eece89819caf6817af62dc4fbd82f0e33f6647b2b6bda175f14607f59f4635451e6b27df282ef73d87',
            sig: '0xa184af07d31dfbef9cc04bd180a1feecedeee664964fcb6043acf13be036db053fc5f6af515583eaad00e13a6bd5ecfce345219ee604665977028600f86bf4eb31a2a7df5463bd5ebda67f7121b4e08a73dade9eaf088a31b3154037f80b1db9836f0f4c98c6b851bad8143137d18e17c69317ee0a818dffea40282e2195b402e25bd77e3dae4bbdb2e271389fdeabeeb34bba73adc1276dab2bc45710a697143f774e5c8ba6b051f3466fe2c9877aa3b9855b95b70c6aeff75a5e2bfc95a11541fb3d268abfca33f1cfbbda15b6899f4d3f2e0a5ba4b1baafecb61ad7954cbaedbd3def16bc5f347f5bf4d798a206c5ede505ba39a6f53ba49248d5c69e6d2a',
          },
          {
            rrset:
              '0x002b0801000151806ab3f7806aa2c5f0e1b40002696f00002b0001000151800024e00b080295a57c3bab7849dbcddf7c72ada71a88146b141110318ca5be672057e865c3e2',
            sig: '0x354b91633c40467dc98e52c8a99f2f59da8b188a796671747135bc08f96ec890f1f8c942a5726bc462d3f9bf6aa2464ad057f51a7daa0757ae03f9526bc2aba0478b2769bcb992a87aca394c944f48d2cdc854afdcc8a4c1fa576535702d58a92421e8ed25d56a96b26e8d422f3acd219550e5cd7597e7a09bf1c2daa21386a850af73f282f1e137834e24e85a6209c93af3ad6eaa55bc43f0e3271efde18f4049abdc2949fc319e5e44b2d87015fd264f58fe1ebf964fdff5c2763119f6a63438cc88f42b40e842f795d80fe3eb5107795a6f09b05f29d7d07cacbf2bd98bf68158beed5953a3e9076aa93d61b25158867b29a0410bff28fc9504968525e587',
          },
          {
            rrset:
              '0x0030080100000e106abd2ea96aa17119e00b02696f0002696f000030000100000e1000880100030803010001a2cab7d32a7c2ee06c0b1d17521cedc8ceb07a0ac35ddb0205bf63214fd88ecc101270765209e6a9c284c826ce817d85834d3ec1931f8bf33f9ee7d48b1f6a43d4b02e525e98d7c5f59be455649a50de723d4a0cd881dd2ebba46603465dc328e02c6cd90e23e1125ec246e9d1a09f155d63970448a358da4cf6487036bf4e3902696f000030000100000e1000880100030803010001d7bcbcc973396ed7cfc8403971456f7bb873364ea806073b2b1e680045875c3ee035e4785f451985ca9bcad1151d4594616c6b8f539ad129a2c7abc01ecb3c9f1fcde670950733fb17841c78d6b806164c0e38eea3b5c523c369b5db1e3ca542076529e05680510b9c26fe5bd801c1921527ebc56397facab18e7e068111bbf902696f000030000100000e1001080101030803010001d815ee2a6f8b33e324d0d9d4ee446bb866a7ea9e962c66cc2a966f03c7d3454e2af9447167ccfcf2862edf8f863f63549a83cad5889bb15fefe7d469130fcccb945b667b5622e2b711f888db4ab7053e0cccdd1a9cd131714017559d6f1085e655a82b4307b08479a03f55930a2992db721a72a36214c334e6d81e0f0c8b913d8f4163538384a4ac3a35b65db952a9da944105e8e6ffc58aab43b53ee91c84c6ba4d020995836c2593730f540b70a65612ea7e7d3beacc05a22b64aeeab9430bbae0c1ee8e8e1ad3d9e8ea94e469de1e52e162468b785a51ccef03f3b91988e11a65f1a79089d354494981b406c6d8d6da445fef58e3e1a14bf9dff10a348837',
            sig: '0x24d050c841a8526de3a71c37a13c1d5ebc2fb6cdb70b5e4c134a515c9afadc81870667d601abeaf9c257305b50ec5d195c471e735bdfa97259f92edd532489245c23d778eb1ac64a955f18bec6e5de02865378423afba1e05da6e0bdaf72d2918d3a1303ceab1e6dbdeab8c8f899fd6a43ea0511338687cfd4ce26f45d0652394103fb2e5e3f3ac8026c0704516ad2df4261855df79da52cc2c938f5ab3b81c3ddb0b2ce1b337cf1d55c973baa2549b4fc22b0e6f9bdbbe50c38f05e86505e7a78224ab0fcb5778c8835264cf9b0906fdc46cc571d6414ee946301f91c70b2326647b8f4cf9635c60906778305ed4ace997c9a42633deedf2e7707bb06b075df',
          },
          {
            rrset:
              '0x002b080200000e106abd2ea96aa17119a96b02696f000d636c696e6963616c6167656e7402696f00002b000100000e1000241f2b0d0269d950f2107d269ee075dca1fd7d237e691def00f48039d141ffbbd0ec9fd2b10d636c696e6963616c6167656e7402696f00002b000100000e1000341f2b0d04babec0c2454d4332c7d2498150c71fe2bf212eb76724f124abe0ff1a964c2d045301942ff56e95a6745c79da7fad0dd8',
            sig: '0x7c941501c3e2ba2606000fc5d2895c6da0a000345fc901a09fe2ccef30edc51bdf561bf626927780ee2b7e577a4588ef7cd9c4af9b6b688e2556c74c9d7010d275cd2224be9db646e2b7ae25fac031feba0c954e429156360f21c5421d60ef63180e82479ea42e0c29823528e2b166bd748e57a36c3b2d83696f3fb4115a5254',
          },
          {
            rrset:
              '0x00300d0200000e106ab468006a98b8801f2b0d636c696e6963616c6167656e7402696f000d636c696e6963616c6167656e7402696f000030000100000e1000440101030d83bd02b9c23e96c2916835c9c367404f5f185de877c434202616b58a1f99458e056d458dbea2d152ee21e08b6b51b51e2f80a869390e143c1979e7292ec9a860',
            sig: '0x51e1fb2baba82f90779b8b3aeffbe8dc44177e6d795ef3f1ca819230ca5c0371c58d871161b741882b3d2db72de715beca2b55a80e9064e26a9f459aa1870ce9',
          },
          {
            rrset:
              '0x00100d030000012c6ab468006a98b8801f2b0d636c696e6963616c6167656e7402696f00045f656e730d636c696e6963616c6167656e7402696f00001000010000012c002d2c613d307834653536636463336330626631386639666365353235633064376435323663323430383535633062',
            sig: '0x8749a9505325e129bf55eaee6a943faab1f39d4dde4edc8ef9b13f05bf1acc1ddff371cf62ab885b0308c826bccb84111beefbc6acdcae28323099bae816bc98',
          },
        ],
        events: [
          {
            eventName: 'InceptionUpdated',
            args: {
              node: '0x0000000000000000000000000000000000000000000000000000000000000000',
              dnstype: 48,
              dnsname: '0x00',
              inception: 1788912000,
            },
            topics: [
              '0x31588ec50fa3691506f14570a6e100e2143dc77c4ce5b805ed775af60b12c9fc',
              '0x0000000000000000000000000000000000000000000000000000000000000000',
              '0x0000000000000000000000000000000000000000000000000000000000000030',
            ],
            data: '0x0000000000000000000000000000000000000000000000000000000000000040000000000000000000000000000000000000000000000000000000006aa0a18000000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000000',
          },
          {
            eventName: 'InceptionUpdated',
            args: {
              node: '0xb2b692c69df4aa3b0a24634d20a3ba1b44c3299d09d6c4377577e20b09e68395',
              dnstype: 43,
              dnsname: '0x02696f00',
              inception: 1789052400,
            },
            topics: [
              '0x31588ec50fa3691506f14570a6e100e2143dc77c4ce5b805ed775af60b12c9fc',
              '0xb2b692c69df4aa3b0a24634d20a3ba1b44c3299d09d6c4377577e20b09e68395',
              '0x000000000000000000000000000000000000000000000000000000000000002b',
            ],
            data: '0x0000000000000000000000000000000000000000000000000000000000000040000000000000000000000000000000000000000000000000000000006aa2c5f0000000000000000000000000000000000000000000000000000000000000000402696f0000000000000000000000000000000000000000000000000000000000',
          },
          {
            eventName: 'InceptionUpdated',
            args: {
              node: '0xb2b692c69df4aa3b0a24634d20a3ba1b44c3299d09d6c4377577e20b09e68395',
              dnstype: 48,
              dnsname: '0x02696f00',
              inception: 1788965145,
            },
            topics: [
              '0x31588ec50fa3691506f14570a6e100e2143dc77c4ce5b805ed775af60b12c9fc',
              '0xb2b692c69df4aa3b0a24634d20a3ba1b44c3299d09d6c4377577e20b09e68395',
              '0x0000000000000000000000000000000000000000000000000000000000000030',
            ],
            data: '0x0000000000000000000000000000000000000000000000000000000000000040000000000000000000000000000000000000000000000000000000006aa17119000000000000000000000000000000000000000000000000000000000000000402696f0000000000000000000000000000000000000000000000000000000000',
          },
          {
            eventName: 'InceptionUpdated',
            args: {
              node: '0x6f79d7d43a76408c585b1d015281f6a49f4f3c9100ecca28f21a1cfa4536ce30',
              dnstype: 43,
              dnsname: '0x0d636c696e6963616c6167656e7402696f00',
              inception: 1788965145,
            },
            topics: [
              '0x31588ec50fa3691506f14570a6e100e2143dc77c4ce5b805ed775af60b12c9fc',
              '0x6f79d7d43a76408c585b1d015281f6a49f4f3c9100ecca28f21a1cfa4536ce30',
              '0x000000000000000000000000000000000000000000000000000000000000002b',
            ],
            data: '0x0000000000000000000000000000000000000000000000000000000000000040000000000000000000000000000000000000000000000000000000006aa1711900000000000000000000000000000000000000000000000000000000000000120d636c696e6963616c6167656e7402696f000000000000000000000000000000',
          },
          {
            eventName: 'InceptionUpdated',
            args: {
              node: '0x6f79d7d43a76408c585b1d015281f6a49f4f3c9100ecca28f21a1cfa4536ce30',
              dnstype: 48,
              dnsname: '0x0d636c696e6963616c6167656e7402696f00',
              inception: 1788393600,
            },
            topics: [
              '0x31588ec50fa3691506f14570a6e100e2143dc77c4ce5b805ed775af60b12c9fc',
              '0x6f79d7d43a76408c585b1d015281f6a49f4f3c9100ecca28f21a1cfa4536ce30',
              '0x0000000000000000000000000000000000000000000000000000000000000030',
            ],
            data: '0x0000000000000000000000000000000000000000000000000000000000000040000000000000000000000000000000000000000000000000000000006a98b88000000000000000000000000000000000000000000000000000000000000000120d636c696e6963616c6167656e7402696f000000000000000000000000000000',
          },
          // note: not included since already imported
          // {
          //   eventName: 'InceptionUpdated',
          //   args: {
          //     dnsname: '0x045f656e730d636c696e6963616c6167656e7402696f00',
          //     dnstype: 16,
          //     inception: 1788393600,
          //     node: '0x2120563d4f36ba449dc217edf8a6beed1f4adfb78ed64eecf7f219078e117e8a',
          //   },
          //   topics: [
          //     '0x31588ec50fa3691506f14570a6e100e2143dc77c4ce5b805ed775af60b12c9fc',
          //     '0x2120563d4f36ba449dc217edf8a6beed1f4adfb78ed64eecf7f219078e117e8a',
          //     '0x0000000000000000000000000000000000000000000000000000000000000010',
          //   ],
          //   data: '0x0000000000000000000000000000000000000000000000000000000000000040000000000000000000000000000000000000000000000000000000006a98b8800000000000000000000000000000000000000000000000000000000000000017045f656e730d636c696e6963616c6167656e7402696f00000000000000000000',
          // },
          {
            eventName: 'Claim',
            args: {
              node: '0x6f79d7d43a76408c585b1d015281f6a49f4f3c9100ecca28f21a1cfa4536ce30',
              owner: '0x4e56cdc3C0BF18f9fCE525C0D7d526c240855c0B',
              dnsname: '0x0d636c696e6963616c6167656e7402696f00',
              inception: 1788393600,
            },
            topics: [
              '0x87db02a0e483e2818060eddcbb3488ce44e35aff49a70d92c2aa6c8046cf01e2',
              '0x6f79d7d43a76408c585b1d015281f6a49f4f3c9100ecca28f21a1cfa4536ce30',
              '0x0000000000000000000000004e56cdc3c0bf18f9fce525c0d7d526c240855c0b',
            ],
            data: '0x0000000000000000000000000000000000000000000000000000000000000040000000000000000000000000000000000000000000000000000000006a98b88000000000000000000000000000000000000000000000000000000000000000120d636c696e6963616c6167656e7402696f000000000000000000000000000000',
          },
        ],
      },
    ]
    for (const x of CLAIMS) {
      it(x.name, async () => {
        const F = await loadFixture()
        const hash = await F.newRegistrar.write.proveAndClaim([
          dnsEncodeName(x.name),
          x.rrsets,
        ])
        const publicClient = await connection.viem.getPublicClient()
        const receipt = await publicClient.waitForTransactionReceipt({ hash })
        const logs = parseEventLogs({
          abi: F.newRegistrar.abi,
          logs: receipt.logs,
        })
        expect(logs).toMatchObject(x.events)
      })
    }
  })
})
