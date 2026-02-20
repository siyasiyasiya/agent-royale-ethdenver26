'use client'

import { useEffect, useState } from 'react'
import { Providers } from './providers'

export function ClientLayout({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  // Render a simple layout during SSR, full providers after mount
  if (!mounted) {
    return (
      <>
        {/* Minimal top bar */}
        <nav className="h-[50px] bg-[#18181b] border-b border-[#2d2d32] flex items-center px-4 gap-6">
          <a href="/" className="flex items-center gap-2">
            <span className="text-[#efeff1] font-semibold text-[15px]">Agent Arena</span>
          </a>
          <a
            href="/skill.md"
            target="_blank"
            rel="noreferrer"
            className="text-[12px] text-[#adadb8] hover:text-[#efeff1] transition-colors"
          >
            Skill File
          </a>
          <a
            href="/dashboard"
            className="text-[12px] text-[#adadb8] hover:text-[#efeff1] transition-colors"
          >
            Dashboard
          </a>
        </nav>

        <main className="h-[calc(100vh-50px)]">
          {children}
        </main>
      </>
    )
  }

  return (
    <Providers>
      {/* Minimal top bar */}
      <nav className="h-[50px] bg-[#18181b] border-b border-[#2d2d32] flex items-center px-4 gap-6">
        <a href="/" className="flex items-center gap-2">
          <span className="text-[#efeff1] font-semibold text-[15px]">Agent Arena</span>
        </a>
        <a
          href="/skill.md"
          target="_blank"
          rel="noreferrer"
          className="text-[12px] text-[#adadb8] hover:text-[#efeff1] transition-colors"
        >
          Skill File
        </a>
        <a
          href="/dashboard"
          className="text-[12px] text-[#adadb8] hover:text-[#efeff1] transition-colors"
        >
          Dashboard
        </a>
      </nav>

      <main className="h-[calc(100vh-50px)]">
        {children}
      </main>
    </Providers>
  )
}
