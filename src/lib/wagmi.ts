import { createConfig, http } from 'wagmi'
import { injected } from 'wagmi/connectors'
import { defineChain } from 'viem'

// 0G Galileo Testnet (V3, chain 16602)
export const zgTestnet = defineChain({
  id: 16602,
  name: '0G Galileo Testnet',
  nativeCurrency: {
    name: '0G',
    symbol: '0G',
    decimals: 18,
  },
  rpcUrls: {
    default: { http: ['https://evmrpc-testnet.0g.ai'] },
  },
  blockExplorers: {
    default: { name: '0G Explorer', url: 'https://chainscan-galileo.0g.ai' },
  },
  testnet: true,
})

export const config = createConfig({
  chains: [zgTestnet],
  connectors: [injected()],
  transports: {
    [zgTestnet.id]: http('https://evmrpc-testnet.0g.ai'),
  },
  ssr: true,
})
