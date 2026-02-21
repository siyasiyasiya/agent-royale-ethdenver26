'use client'

import { useConnect, useAccount, useDisconnect } from 'wagmi'

export function WalletConnectButton() {
  const { isConnected, address } = useAccount()
  const { disconnect } = useDisconnect()
  const { connect, connectors, isPending } = useConnect()

  if (isConnected) {
    return (
      <button
        type="button"
        onClick={() => disconnect()}
        className="bg-[#2d2d32] hover:bg-[#3d3d42] text-[#efeff1] text-sm px-4 py-2 rounded transition-colors"
      >
        {address ? `${address.slice(0, 6)}...${address.slice(-4)}` : 'Connected'}
      </button>
    )
  }

  const connector = connectors[0]

  return (
    <button
      type="button"
      onClick={() => connector && connect({ connector })}
      disabled={!connector || isPending}
      className="bg-[#a970ff] hover:bg-[#9147ff] disabled:bg-[#3d3d42] disabled:cursor-not-allowed text-white text-sm px-4 py-2 rounded transition-colors"
    >
      {isPending ? 'Connecting...' : 'Connect Wallet'}
    </button>
  )
}
