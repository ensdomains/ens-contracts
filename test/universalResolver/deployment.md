# L2 Primary Name Deployment

<!-- https://mermaid.js.org/syntax/flowchart.html -->

```mermaid
graph LR
	root{{root}} -.-> reverse{{reverse}}
	root -.-> eth{{eth}}
	eth -.-> eth_raffy{{raffy.eth}}
	eth_raffy -- resolver --> resolver_tor[TheOffchainResolver]
	resolver_tor o--o resolver_tor_raffy(addr&lpar;raffy.eth, 60&rpar; &rarr; 0x5105)
	eth -.-> eth_ghost{{ghost.eth}}
	eth_ghost -- resolver --> resolver_pr3;
	eth -.-> eth_nick{{vitalik.eth}}
	eth_nick -- resolver --> resolver_pr2[
		<a href="https://etherscan.io/address/0x4976fb03C32e5B8cfe2b6cCB31c09Ba78EBaBa41#readContract">PublicResolverV2</a>
	]
    reverse -.-> reverse_addr{{addr.reverse}}
	reverse -.-> reverse_default{{default.reverse}}
	reverse_default -- resolver --> resolver_reverse_default[
		<a href="https://github.com/ensdomains/ens-evmgateway/blob/master/crosschain-reverse-resolver/contracts/DefaultReverseResolver.sol">DefaultReverseResolver</a>
	]
	resolver_reverse_default o--o default_0001(name&lpar;0001.default.reverse&rpar; &rarr; ghost.eth)
	reverse -.-> reverse_80000000{{
		80000000.reverse?
		&lpar;chain = 0&rpar;
	}}
	reverse -.-> reverse_base{{
		80002105.reverse
		&lpar;chain = 8453&rpar;
	}}
	reverse-.-reverse_linea{{
		8000e708.reverse
		&lpar;chain = 59144&rpar;
	}}
	reverse_addr -- resolver --> resolver_reverse_default;
	reverse_base -- resolver --> resolver_reverse_base[
		**Base**
		<a href="https://github.com/ensdomains/ens-evmgateway/blob/master/crosschain-reverse-resolver/contracts/L1ReverseResolver.sol">L1ReverseResolver</a>
	]
	reverse_linea -- resolver --> resolver_reverse_linea[
		**Linea**
		<a href="https://github.com/ensdomains/ens-evmgateway/blob/master/crosschain-reverse-resolver/contracts/L1ReverseResolver.sol">L1ReverseResolver</a>
	]
	reverse_3c -- resolver --> resolver_3c{TBD};
	reverse_80000000 -- resolver --> resolver_reverse_default;
    reverse -.-> reverse_3c{{
		3c.reverse?
		&lpar;chain = 1&rpar;
	}}
    reverse_addr -.-> reverse_addr_5105{{5105.addr.reverse}}
	resolver_pr3 o--o resolver_pr3_5105(name&lpar;**5105.addr.reverse**&rpar; &rarr; raffy.eth)
    reverse_addr_5105 & reverse_addr_1234 -- resolver --> resolver_pr3[
		<a href="https://etherscan.io/address/0x231b0Ee14048e9dCcD1d247744d114a4EB5E8E63#readContract">PublicResolverV3</a>
	]
    reverse_addr -.-> reverse_addr_1234{{1234.addr.reverse}};
	resolver_pr3 o--o resolver_pr3_ghost(addr&lpar;ghost.eth, 0x80000000&rpar; &rarr; 0x0001)
	resolver_reverse_base -. verifier .-> verifier_base[
		**Base**
		<a href="https://github.com/unruggable-labs/unruggable-gateways/blob/main/contracts/op/OPFaultVerifier.sol">OPFaultVerifier</a>
	]
	verifier_base <== gateway ==> drpc_base[
		<a href="https://lb.drpc.org/gateway/unruggable?network=base">dRPC
	]
	verifier_base -. rollup .-> rollup_base[
		<a href="https://etherscan.io/address/0xbEb5Fc579115071764c7423A4f12eDde41f106Ed">OptimismPortal</a>
	]
	resolver_reverse_linea -. verifier .-> verifier_linea[
		<a href="https://github.com/unruggable-labs/unruggable-gateways/blob/main/contracts/linea/LineaVerifier.sol">LineaVerifier</a>
	]
	verifier_linea <== gateway ==> drpc_linea[
		<a href="https://lb.drpc.org/gateway/unruggable?network=linea">dRPC
	]
	verifier_linea & verifier_linea_old -. rollup .-> rollup_linea[
		<a href="https://etherscan.io/address/0xd19d4B5d358258f05D7B411E21A1460D11B0876F">L1MessageService</a>
	]
	resolver_reverse_base -. fallback .-> resolver_reverse_default;
	resolver_reverse_base == target ==> registrar_base[
		<a href="https://github.com/ensdomains/ens-contracts/blob/feature/simplify-reverse-resolver/contracts/reverseRegistrar/L2ReverseRegistrar.sol">L2ReverseRegistrar</a>
		coinType = 0x80002105
	]
	resolver_reverse_linea -. fallback .-> resolver_reverse_default;
	resolver_reverse_linea == target ==> registrar_linea[
		<a href="https://github.com/ensdomains/ens-contracts/blob/feature/simplify-reverse-resolver/contracts/reverseRegistrar/L2ReverseRegistrar.sol">L2ReverseRegistrar</a>
		coinType = 0x8000e708
	]
	registrar_linea o--o linea_5105(name&lpar;0x5105&rpar; &rarr; raffy.eth)
	registrar_linea o--o linea_0001(name&lpar;0x0001&rpar; &rarr; ghost.linea.eth)
	registrar_base o--o base_5105(name&lpar;0x5105&rpar; &rarr; raffy.base.eth)
	eth -.-> eth_linea{{linea.eth}}
	eth_linea -- resolver --> resolver_eth_linea[
		**Linea**
		<a href="https://etherscan.io/address/0xde16ee87B0C019499cEBDde29c9F7686560f679a#code">L1Resolver</a>
	]
	resolver_eth_linea == target ==> linea_pr[
		<a href="https://lineascan.build/address/0x86c5AED9F27837074612288610fB98ccC1733126">PublicResolver</a>
	]
	resolver_eth_linea -. verifier .-> verifier_linea_old[
		<a href="https://etherscan.io/address/0x2aD1A39a3b616FB11ac5DB290061A0A5C09771f3#code">LineaSparseProofVerifier</a>
	]
	verifier_linea_old <== gateway ==> gateway_linea[
		<a href="https://linea-ccip-gateway.linea.build/">EVMGateway</a>
	]
	linea_pr o--o linea_pr_0001(addr&lpar;ghost.linea.eth, 0x8000e708&rpar; &rarr; 0x0002)
	eth -.-> eth_base{{base.eth}}
	eth_base -- resolver --> resolver_eth_base[
		**Base**
		<a href="https://etherscan.io/address/0xde9049636F4a1dfE0a64d1bFe3155C0A14C54F31#code">L1Resolver</a>
	]
	resolver_eth_base <== gateway ==> offchain_base[
		<a href="https://api.coinbase.com/api/v1/domain/resolver/resolveDomain/%7Bsender%7D/%7Bdata%7D">Coinbase Offchain</a>
	]
	offchain_base == target ==> base_pr[
		<a href="https://basescan.org/address/0xC6d566A56A1aFf6508b41f6c90ff131615583BCD">L2Resolver</a>
	]
	base_pr o--o base_eth_raffy(addr&lpar;raffy.base.eth&rpar; &rarr; 0x5105)

	class root node
	classDef node stroke:#000,stroke-width:3px;
	class reverse_80000000,reverse_3c,resolver_3c question
	classDef question stroke:#333
	class resolver_pr2,resolver_pr3,resolver_eth_base,resolver_eth_linea,resolver_tor r
	classDef r stroke:#58f
	class registrar_base,registrar_linea,rollup_linea,rollup_base c
	classDef c stroke:#666,stroke-dasharray:4
	class resolver_reverse_linea,resolver_reverse_base,resolver_reverse_default rr
	classDef rr stroke:#080
	class default_0001,resolver_pr3_5105,resolver_pr3_ghost,base_5105,base_eth_raffy,linea_pr_0001,linea_0001,linea_5105,resolver_tor_raffy rec
	classDef rec stroke:#630
	class offchain_base,drpc_base,drpc_linea,gateway_linea g
	classDef g stroke:#888
	class verifier_linea,verifier_base,verifier_linea_old v
	classDef v stroke:#808

```

#### Graph Legend

```mermaid
graph LR
	node{{node}}  -.-> contract
	contract o--o record(record)
	contract ==> crosschain
	class node,contract,crosschain,record key
	classDef key stroke:#333
```

## Resolution Examples

1. `reverse(0x5105, 60)`
   - `resolve("5105.addr.reverse", name())`
     - `resolver("5105.addr.reverse") = PublicResolverV3`
       - `name() = "raffy.eth"`
       - `resolve("raffy.eth", multicall(addr(), addr(0x80000000)))`
       - `resolver("raffy.eth") = TheOffchainResolver`
         - `resolve() = [0x5105, 0x]`
         - `checkedAddress = 0x5105 == 0x5105` &rarr; ✅️
1. `reverse(0x1234, 60)`
   - `resolve("1234.addr.reverse", name())`
     - `resolver("1234.addr.reverse") = PublicResolverV3`
       - `resolve(name()) = ""` &rarr; 🛑️
1. `reverse(0x0001, 60)`
   - `resolve("0001.addr.reverse", name()`
   - `resolver("0001.addr.reverse") = null`
   - `resolver("addr.reverse") = DefaultReverseResolver`
     - `resolve(name()) = "ghost.eth"`
     - `resolve("ghost.eth", multicall(addr(), addr(0x80000000)))`
     - `resolver("ghost.eth") = PublicResolverV3`
       - `resolve() = [0x, 0x0001]`
       - `checkedAddress = 0x0001 == 0x0001` &rarr; ✅️
1. `reverse(0x5105, 0x80000000)`
   - `resolve("5105.default.reverse", name())`
     - `resolver("5105.default.reverse") = null`
     - `resolver("default.reverse") = DefaultReverseResolver`
       - `resolve(name()) = ""` &rarr; 🛑️
1. `reverse(0x5105, 0x8000e708)`
   - `resolve("5105.8000e708.reverse", name())`
     - `resolver("5105.8000e708.reverse) = null`
     - `resolver("8000e708.reverse") = L1ReverseResolver`
       - `resolve(name()) = "raffy.eth"` (L1 &rarr; L2)
       - `resolve("raffy.eth", multicall(addr(0x8000e708), addr(0x80000000)))`
       - `resolver("raffy.eth") = TheOffchainResolver`
         - `resolve() = [0x, 0x]`
         - `checkedAddress = 0x` &rarr; 🛑️
1. `reverse(0x0001, 0x8000e708)`
   - `resolve("0001.8000e708.reverse", name())`
   - `resolver("0001.8000e708.reverse) = null`
   - `resolver("8000e708.reverse") = L1ReverseResolver`
     - `resolve(name()) = "ghost.linea.eth"` (L1 &rarr; L2)
     - `resolve("ghost.linea.eth", multicall(addr(0x8000e708), addr(0x80000000)))`
     - `resolver("ghost.linea.eth") = null`
     - `resolver("linea.eth") = LineaL1Resolver`
       - `resolve() = [0x0002, 0x]`
       - `checkedAddress = 0x0002 != 0x0001` &rarr; 🛑️
