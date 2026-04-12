import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'AI Copilot · 失败智能问答',
  description: '基于创业坟场失败案例知识库，用自然语言提问，获取有案例引用支撑的失败模式分析。',
  openGraph: {
    title: 'AI Copilot · 失败智能问答 | 创业坟场',
    description: '基于创业坟场失败案例知识库，用自然语言提问，获取有案例引用支撑的失败模式分析。',
    url: '/copilot',
  },
};

export default function CopilotLayout({ children }: { children: React.ReactNode }) {
  return children;
}
