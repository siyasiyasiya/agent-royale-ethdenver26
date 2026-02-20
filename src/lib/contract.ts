import { ethers } from 'ethers'

// Contract address - set after deployment
export const INFT_CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_INFT_CONTRACT_ADDRESS || ''

// ABI for the AgentArenaINFT contract
export const INFT_ABI = [
  // Mint (platform only)
  {
    inputs: [
      { name: 'uri', type: 'string' },
      { name: 'claimCodeHash', type: 'bytes32' },
    ],
    name: 'mint',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  // Claim (anyone with valid code)
  {
    inputs: [
      { name: 'tokenId', type: 'uint256' },
      { name: 'claimCode', type: 'string' },
    ],
    name: 'claim',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  // Update stats (platform only)
  {
    inputs: [
      { name: 'tokenId', type: 'uint256' },
      { name: 'wins', type: 'uint256' },
      { name: 'losses', type: 'uint256' },
      { name: 'draws', type: 'uint256' },
      { name: 'bestClickCount', type: 'uint256' },
      { name: 'eloRating', type: 'uint256' },
    ],
    name: 'updateStats',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  // Read functions
  {
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    name: 'ownerOf',
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    name: 'tokenURI',
    outputs: [{ name: '', type: 'string' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    name: 'getStats',
    outputs: [
      { name: 'wins', type: 'uint256' },
      { name: 'losses', type: 'uint256' },
      { name: 'draws', type: 'uint256' },
      { name: 'bestClickCount', type: 'uint256' },
      { name: 'eloRating', type: 'uint256' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    name: 'isUnclaimed',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'nextTokenId',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  // Events
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: 'tokenId', type: 'uint256' },
      { indexed: false, name: 'claimCodeHash', type: 'bytes32' },
    ],
    name: 'AgentMinted',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: 'tokenId', type: 'uint256' },
      { indexed: true, name: 'claimer', type: 'address' },
    ],
    name: 'AgentClaimed',
    type: 'event',
  },
] as const

// Helper to get platform wallet for server-side operations
export function getPlatformWallet() {
  const privateKey = process.env.PLATFORM_PRIVATE_KEY
  const rpcUrl = process.env.ZG_RPC_URL || 'https://evmrpc-testnet.0g.ai'

  if (!privateKey) {
    throw new Error('PLATFORM_PRIVATE_KEY not set')
  }

  const provider = new ethers.JsonRpcProvider(rpcUrl)
  return new ethers.Wallet(privateKey, provider)
}

// Helper to get contract instance for server-side operations
export function getContract(signerOrProvider?: ethers.Signer | ethers.Provider) {
  if (!INFT_CONTRACT_ADDRESS) {
    throw new Error('INFT_CONTRACT_ADDRESS not set')
  }

  const providerOrSigner = signerOrProvider || getPlatformWallet()
  return new ethers.Contract(INFT_CONTRACT_ADDRESS, INFT_ABI, providerOrSigner)
}

// Hash a claim code the same way the contract does
export function hashClaimCode(claimCode: string): string {
  return ethers.keccak256(ethers.toUtf8Bytes(claimCode))
}
