# L2 Primary Name Deployment

```mermaid
graph LR;
	root-.->reverse[
		**reverse**
	]
	root-.->eth[
		**eth**
	]
	eth-.->eth_raffy[
		**raffy.eth**
	]
	resolver_tor o--o resolver_tor_raffy[
		*Record*
		addr&lpar;raffy.eth, 60&rpar; &rarr; 0x5105
	]
	eth-.->eth_ghost[**ghost.eth**]
	eth_ghost-- resolver -->resolver_pr;
	eth_raffy-- resolver -->resolver_tor[
		TheOffchainResolver
	]
    reverse-.->reverse_addr[
		**addr.reverse**
	]
	reverse-.->reverse_default[
		**default.reverse**
	]
	reverse_default-- resolver -->resolver_default[
		<a href="https://github.com/ensdomains/ens-evmgateway/blob/master/crosschain-reverse-resolver/contracts/DefaultReverseResolver.sol">DefaultReverseResolver</a>
	]
	resolver_default o--o default_0001[
		*Record*
		name&lpar;0001.default.reverse&rpar; &rarr; ghost.eth
	]
	reverse-.->reverse_80000000[
		**80000000.reverse**
		&lpar;chain = 0&rpar;
	]
	reverse-.->reverse_base[
		**80002105.reverse**
		&lpar;chain = 8453&rpar;
		Base
	]
	reverse-.-reverse_linea[
		**8000e708.reverse**
		&lpar;chain = 59144&rpar;
		Linea
	]
	reverse_addr-- resolver -->resolver_default;
	reverse_base-- resolver -->resolver_base[
		<a href="https://github.com/ensdomains/ens-evmgateway/blob/master/crosschain-reverse-resolver/contracts/L1ReverseResolver.sol">L1ReverseResolver</a>
		Base
	]
	reverse_linea-- resolver -->resolver_linea[
		<a href="https://github.com/ensdomains/ens-evmgateway/blob/master/crosschain-reverse-resolver/contracts/L1ReverseResolver.sol">L1ReverseResolver</a>
		Linea				
	]
	reverse_3c-- resolver -->resolver_addr[NYI];
	reverse_80000000-- resolver -->resolver_default;
    reverse-.->reverse_3c[
		**3c.reverse**?
		&lpar;chain = 1&rpar;
	]
    reverse_addr-.->reverse_addr_5105[**5105.addr.reverse**]
	resolver_pr o--o resolver_pr_5105[
		*Record*
		name&lpar;**5105.addr.reverse**&rpar; &rarr; raffy.eth
	]
    reverse_addr_5105-- resolver -->resolver_pr[PublicResolver]	
    reverse_addr-.->reverse_addr_1234[**1234.addr.reverse**];
	resolver_pr o--o resolver_pr_1234[
		*Record*
		name&lpar;**1234.addr.reverse**&rpar; &rarr; &lt;null&gt;
	]
	resolver_pr o--o resolver_pr_ghost[
		*Record*
		addr&lpar;ghost.eth, 0x80000000&rpar; &rarr; 0x0001 
	]
	reverse_addr_1234-- resolver -->resolver_pr[PublicResolver]	
	resolver_base-. verifier .->verifier_base[
		<a href="https://github.com/unruggable-labs/unruggable-gateways/blob/main/contracts/op/OPFaultVerifier.sol">OPFaultVerifier</a>
		Base
	]
	verifier_base-. rollup .->rollup_base[
		<a href="https://etherscan.io/address/0xbEb5Fc579115071764c7423A4f12eDde41f106Ed">OptimismPortal</a>
		Base		
	]
	resolver_linea-. verifier .->verifier_linea[
		<a href="https://github.com/unruggable-labs/unruggable-gateways/blob/main/contracts/linea/LineaVerifier.sol">LineaVerifier</a>
		Linea
	]
	verifier_linea-. rollup .->rollup_linea[
		<a href="https://etherscan.io/address/0xd19d4B5d358258f05D7B411E21A1460D11B0876F">L1MessageService</a>
		Linea
	]
	resolver_base-. fallback .->resolver_default;
	resolver_base== target ==>registrar_base[
		<a href="https://github.com/ensdomains/ens-contracts/blob/feature/simplify-reverse-resolver/contracts/reverseRegistrar/L2ReverseRegistrar.sol">L2ReverseRegistrar</a>
		coinType = 0x80002105
	]
	resolver_linea-. fallback .->resolver_default;
	resolver_linea== target ==>registrar_linea[
		Linea
		<a href="https://github.com/ensdomains/ens-contracts/blob/feature/simplify-reverse-resolver/contracts/reverseRegistrar/L2ReverseRegistrar.sol">L2ReverseRegistrar</a>
		coinType = 0x8000e708
	]
	registrar_linea o--o linea_5105[
		*Record*
		 name&lpar;0x5105&rpar; &rarr; raffy.eth
	]
	registrar_linea o--o linea_0001[
		*Record*
		 name&lpar;0x0001&rpar; &rarr; ghost.linea.eth
	]
	registrar_base o--o base_1234[
		*Record*
		name&lpar;0x5105&rpar; &rarr; raffy.base.eth
	]
	eth-.->eth_linea[
		**linea.eth**
	]
	eth_linea-- resolver -->resolver_eth_linea[
		<a href="https://etherscan.io/address/0xde16ee87B0C019499cEBDde29c9F7686560f679a#code">LineaL1Resolver</a>
	]
	resolver_eth_linea== target ==>linea_pr[
		<a href="https://lineascan.build/address/0x86c5AED9F27837074612288610fB98ccC1733126">LineaPublicResolver</a>
	]
	linea_pr o--o linea_pr_0001[
		*Record*
		addr&lpar;ghost.linea.eth, 0x8000e708&rpar; &rarr; 0x0002
	]

```

## Resolution Examples

1. `resolve("5105.addr.reverse", name())`
	* `resolver("5105.addr.reverse") = PublicResolver`
		* `name() = "raffy.eth"`
		* `resolve("raffy.eth", multicall(addr(), addr(0x80000000)))`
			* `resolver("raffy.eth") = TheOffchainResolver`
				* `resolve() = [0x5105, 0x]`
				* `checkedAddress = 0x5105`
	* ✅️ `0x5105 == 0x5105`
1. `resolve("1234.addr.reverse", name())`
	* `resolver("1234.addr.reverse") = PublicResolver`
		* `resolve(name()) = ""`
		* 🛑️
1. `resolve("0001.addr.reverse", name()`
	* `resolver("0001.addr.reverse") = null`
	* `resolver("addr.reverse") = DefaultReverseResolver`
		* `resolve(name()) = "ghost.eth"`
		* `resolve("ghost.eth", multicall(addr(), addr(0x80000000)))`
			* `resolver("ghost.eth") = PublicResolver`
				* `resolve() = [0x, 0x0001]`
				`checkedAddress = 0x0001`
	* ✅️ `0x0001 == 0x0001`
1. `resolve("5105.default.reverse", name())`
	* `resolver("5105.default.reverse") = null`
	* `resolver("default.reverse") = DefaultReverseResolver`
		* `resolve(name()) = ""`
		* 🛑️
1. `resolve("5105.80000000.reverse", name())`
	* *same as above*
1. `resolve("5105.8000e708.reverse", name())`
	* `resolver("5105.8000e708.reverse) = null`
	* `resolver("8000e708.reverse") = L1ReverseResolver`
		* `resolve(name()) = "raffy.eth"` (L1 &rarr; L2)
		* `resolve("raffy.eth", multicall(addr(0x8000e708), addr(0x80000000)))`
			* `resolver("raffy.eth") = TheOffchainResolver`
				* `resolve() = [0x, 0x]`
				* 🛑️
1. `resolve("0001.8000e708.reverse", name())`
	* `resolver("0001.8000e708.reverse) = null`
	* `resolver("8000e708.reverse") = L1ReverseResolver`
		* `resolve(name()) = "ghost.linea.eth"` (L1 &rarr; L2)
		* `resolve("ghost.linea.eth", multicall(addr(0x8000e708), addr(0x80000000)))`
			* `resolver("ghost.linea.eth") = null`
			* `resolver("linea.eth") = LineaL1Resolver`
				* `resolve() = [0x0002, 0x]`
				* `checkedAddress = 0x0002`
	* 🛑️ `0x0001 != 0x0002`