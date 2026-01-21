import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: '创业坟场 - 失败案例数据库',
  description: '记录和分析创业失败案例，为创业者提供借鉴和警示',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="zh-CN">
      <body className="bg-graveyard-dark text-gray-100 min-h-screen">
        {children}
      </body>
    </html>
  )
}
