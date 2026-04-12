'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { type CopilotResult, askCopilotAction } from './actions';

const SUGGESTED_QUESTIONS = [
  '为什么许多共享出行创业公司在融资后迅速倒闭？',
  '硬件创业公司最常见的失败原因是什么？',
  '创始人内部矛盾是如何导致公司失败的？',
  '流媒体平台有哪些典型的失败模式？',
  '过早扩张和产品市场契合不足哪个更危险？',
];

export default function CopilotPage() {
  const searchParams = useSearchParams();
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CopilotResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const initializedQuestionRef = useRef<string | null>(null);

  async function handleSubmit(q: string) {
    const trimmed = q.trim();
    if (!trimmed || loading) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await askCopilotAction(trimmed);
      if (!res.ok) {
        setError(`Copilot 请求失败：${res.error}`);
      } else {
        setResult(res);
      }
    } catch {
      setError('请求出错，请稍后重试。');
    } finally {
      setLoading(false);
    }
  }

  function handleSuggestion(q: string) {
    setQuestion(q);
    if (inputRef.current) inputRef.current.value = q;
    handleSubmit(q);
  }

  useEffect(() => {
    const presetQuestion = searchParams.get('q')?.trim() ?? '';
    if (!presetQuestion) return;
    if (initializedQuestionRef.current === presetQuestion) return;
    initializedQuestionRef.current = presetQuestion;
    setQuestion(presetQuestion);
    if (inputRef.current) inputRef.current.value = presetQuestion;
    if (searchParams.get('run') === '1') {
      void (async () => {
        setLoading(true);
        setError(null);
        setResult(null);
        try {
          const res = await askCopilotAction(presetQuestion);
          if (!res.ok) setError(`Copilot 请求失败：${res.error}`);
          else setResult(res);
        } catch {
          setError('请求出错，请稍后重试。');
        } finally {
          setLoading(false);
        }
      })();
    }
  }, [searchParams]);

  return (
    <main style={{ maxWidth: 860, margin: '0 auto', padding: '48px 24px 80px' }}>
      <Link href="/" style={{ color: '#9fb3ff', textDecoration: 'none', fontSize: 14 }}>
        ← 返回案例列表
      </Link>

      <section style={{ marginTop: 24, marginBottom: 32 }}>
        <p style={{ color: '#9fb3ff', fontSize: 13, letterSpacing: 1.2, margin: '0 0 8px' }}>
          FAILURE COPILOT
        </p>
        <h1 style={{ fontSize: 34, lineHeight: 1.15, margin: '0 0 10px' }}>失败智能问答</h1>
        <p style={{ color: '#c8d0e5', lineHeight: 1.7, margin: 0 }}>
          基于创业坟场知识库，用自然语言提问，获取有案例引用支撑的失败模式分析。
        </p>
      </section>

      {/* 建议问题 */}
      <section style={{ marginBottom: 24 }}>
        <p style={{ color: '#9fb3ff', fontSize: 12, letterSpacing: 0.8, margin: '0 0 10px' }}>
          常见问题
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {SUGGESTED_QUESTIONS.map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => handleSuggestion(q)}
              disabled={loading}
              style={{
                padding: '6px 14px',
                borderRadius: 999,
                border: '1px solid #2a3658',
                background: '#10172b',
                color: '#9fb3ff',
                fontSize: 13,
                cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.5 : 1,
              }}
            >
              {q}
            </button>
          ))}
        </div>
      </section>

      {/* 输入区 */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSubmit(question);
        }}
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          padding: 20,
          borderRadius: 16,
          border: '1px solid #1d2746',
          background: '#10172b',
          marginBottom: 32,
        }}
      >
        <textarea
          ref={inputRef}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="例：为什么有些创业公司融资后反而更快倒闭？"
          rows={3}
          style={{
            padding: '12px 14px',
            borderRadius: 10,
            border: '1px solid #2a3658',
            background: '#0b1020',
            color: '#f5f7fb',
            fontSize: 15,
            resize: 'vertical',
            fontFamily: 'inherit',
            lineHeight: 1.6,
          }}
        />
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button
            type="submit"
            disabled={loading || !question.trim()}
            style={{
              padding: '10px 24px',
              borderRadius: 10,
              border: 'none',
              background: loading || !question.trim() ? '#2a3658' : '#5b7cff',
              color: loading || !question.trim() ? '#6b7ca8' : '#fff',
              fontWeight: 600,
              fontSize: 15,
              cursor: loading || !question.trim() ? 'not-allowed' : 'pointer',
              transition: 'background 0.2s',
            }}
          >
            {loading ? '分析中…' : '提问'}
          </button>
        </div>
      </form>

      {/* 错误 */}
      {error && <p style={{ color: '#f87171', marginBottom: 24 }}>{error}</p>}

      {/* 加载占位 */}
      {loading && (
        <div
          style={{
            padding: 24,
            borderRadius: 16,
            border: '1px solid #1d2746',
            background: '#10172b',
            color: '#9fb3ff',
            textAlign: 'center',
          }}
        >
          正在检索相关案例并生成分析…
        </div>
      )}

      {/* 结果 */}
      {result && result.ok && !loading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* 回答主体 */}
          <div
            style={{
              padding: 24,
              borderRadius: 16,
              border: '1px solid #1d2746',
              background: '#10172b',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 16,
                flexWrap: 'wrap',
                gap: 8,
              }}
            >
              <p style={{ color: '#9fb3ff', fontSize: 12, letterSpacing: 1, margin: 0 }}>AI 分析</p>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                {result.model && (
                  <span style={{ color: '#6b7ca8', fontSize: 11 }}>{result.model}</span>
                )}
                <span
                  style={{
                    padding: '2px 8px',
                    borderRadius: 999,
                    fontSize: 11,
                    background: result.grounded ? '#1a3a2a' : '#2a2a1a',
                    color: result.grounded ? '#34d399' : '#fbbf24',
                  }}
                >
                  {result.grounded ? 'LLM 增强' : '规则摘要'}
                </span>
              </div>
            </div>
            <div
              style={{
                color: '#e2e8f0',
                lineHeight: 1.8,
                fontSize: 15,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            >
              {result.answer}
            </div>
          </div>

          {/* 引用案例 */}
          {result.citations.length > 0 && (
            <div>
              <p style={{ color: '#9fb3ff', fontSize: 12, letterSpacing: 1, margin: '0 0 12px' }}>
                引用案例（{result.citations.length}）
              </p>
              <div style={{ display: 'grid', gap: 10 }}>
                {result.citations.map((c) => (
                  <div
                    key={c.caseId}
                    style={{
                      padding: '12px 16px',
                      borderRadius: 12,
                      border: '1px solid #1d2746',
                      background: '#10172b',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 6,
                    }}
                  >
                    <Link
                      href={`/cases/s/${encodeURIComponent(c.slug)}`}
                      style={{
                        color: '#7d9cff',
                        fontWeight: 600,
                        textDecoration: 'none',
                        fontSize: 15,
                      }}
                    >
                      {c.companyName}
                    </Link>
                    <p style={{ margin: 0, color: '#c8d0e5', fontSize: 13, lineHeight: 1.6 }}>
                      {c.relevantText}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </main>
  );
}
