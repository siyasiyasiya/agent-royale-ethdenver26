'use client'

import dynamic from 'next/dynamic'

// Dynamic import with SSR disabled to avoid wagmi hooks during server rendering
const DashboardContent = dynamic(
  () => import('@/components/DashboardContent').then((mod) => mod.DashboardContent),
  {
    ssr: false,
    loading: () => (
      <div className="min-h-full bg-[#0e0e10] flex items-center justify-center">
        <div className="text-[#adadb8]">Loading...</div>
      </div>
    ),
  }
)

export default function DashboardPage() {
  return <DashboardContent />
}
