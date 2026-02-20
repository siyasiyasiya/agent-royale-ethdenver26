'use client'

import { use } from 'react'
import dynamic from 'next/dynamic'

// Dynamic import with SSR disabled to avoid wagmi hooks during server rendering
const ClaimContent = dynamic(
  () => import('@/components/ClaimContent').then((mod) => mod.ClaimContent),
  {
    ssr: false,
    loading: () => (
      <div className="min-h-full bg-[#0e0e10] flex items-center justify-center">
        <div className="text-[#adadb8]">Loading...</div>
      </div>
    ),
  }
)

export default function ClaimPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params)
  return <ClaimContent code={code} />
}
