'use client'

import { ConnectButton } from '@rainbow-me/rainbowkit'

export function WalletConnectButton() {
  return (
    <ConnectButton
      chainStatus="none"
      showBalance={false}
      label="Connect Wallet"
    />
  )
}
