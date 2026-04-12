'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  askCopilotAction,
  createCopilotSessionAction,
  getCopilotSessionAction,
  listCopilotSessionsAction,
  pinCopilotCaseAction,
  submitCopilotFeedbackAction,
  unpinCopilotCaseAction,
} from './actions';
import { caseListHref } from '@/lib/casesApi';
import {
  getOrCreateCopilotVisitorId,
  getStoredActiveCopilotSessionId,
  setStoredActiveCopilotSessionId,
} from '@/lib/copilotVisitor';
import { countryLabel, industryLabel } from '@sg/shared/taxonomy';
import type {
  CopilotFeedbackVote,
  CopilotSessionDetail,
  CopilotSessionSummary,
} from '@sg/shared/schemas/copilot';

const SUGGESTED_QUESTIONS = [
  '为什么许多共享出行创业公司在融资后迅速倒闭？',
  '硬件创业公司最常见的失败原因是什么？',
  '创始人内部矛盾是如何导致公司失败的？',
  '流媒体平台有哪些典型的失败模式？',
  '过早扩张和产品市场契合不足哪个更危险？',
];

function formatSessionTime(value: string): string {
  const date = new Date(value);
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function formatEstimatedCost(value: number | null): string | null {
  if (value == null) return null;
  if (value < 0.01) return `$${value.toFixed(4)}`;
  return `$${value.toFixed(2)}`;
}

function fallbackReasonLabel(value: string | null): string | null {
  if (!value) return null;
  if (value === 'provider_unavailable') return '未配置 LLM';
  if (value === 'provider_error') return 'LLM 降级';
  if (value === 'no_relevant_cases') return '无相关案例';
  return value;
}

export default function CopilotPage() {
  const searchParams = useSearchParams();
  const [visitorId, setVisitorId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<CopilotSessionSummary[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [activeSession, setActiveSession] = useState<CopilotSessionDetail | null>(null);
  const [question, setQuestion] = useState('');
  const [bootstrapping, setBootstrapping] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [creatingSession, setCreatingSession] = useState(false);
  const [pinningCaseId, setPinningCaseId] = useState<string | null>(null);
  const [feedbackingMessageId, setFeedbackingMessageId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const initializedQuestionRef = useRef<string | null>(null);

  async function refreshSessions(nextVisitorId: string): Promise<CopilotSessionSummary[]> {
    const res = await listCopilotSessionsAction(nextVisitorId);
    if (!res.ok) {
      setError(`会话列表加载失败：${res.error}`);
      return [];
    }
    setSessions(res.data);
    return res.data;
  }

  function applyActiveSession(detail: CopilotSessionDetail | null) {
    setActiveSession(detail);
    const nextId = detail?.session.id ?? null;
    setActiveSessionId(nextId);
    setStoredActiveCopilotSessionId(nextId);
  }

  async function openSession(nextVisitorId: string, sessionId: string) {
    const res = await getCopilotSessionAction(nextVisitorId, sessionId);
    if (!res.ok) {
      setError(`会话加载失败：${res.error}`);
      applyActiveSession(null);
      return;
    }
    setError(null);
    applyActiveSession(res.data);
  }

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      const nextVisitorId = getOrCreateCopilotVisitorId();
      if (cancelled) return;
      setVisitorId(nextVisitorId);
      const items = await refreshSessions(nextVisitorId);
      if (cancelled) return;
      const storedSessionId = getStoredActiveCopilotSessionId();
      const targetSessionId =
        (storedSessionId && items.some((item) => item.id === storedSessionId) ? storedSessionId : null) ??
        items[0]?.id ??
        null;

      if (targetSessionId) {
        const sessionRes = await getCopilotSessionAction(nextVisitorId, targetSessionId);
        if (cancelled) return;
        if (!sessionRes.ok) {
          setError(`会话加载失败：${sessionRes.error}`);
          applyActiveSession(null);
        } else {
          setError(null);
          applyActiveSession(sessionRes.data);
        }
      } else {
        applyActiveSession(null);
      }
      if (!cancelled) setBootstrapping(false);
    }

    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSubmit(nextQuestion: string) {
    const trimmed = nextQuestion.trim();
    if (!trimmed || !visitorId || submitting) return;

    setSubmitting(true);
    setError(null);
    try {
      const res = await askCopilotAction({
        visitorId,
        sessionId: activeSessionId ?? undefined,
        question: trimmed,
        topK: 5,
        pinnedCaseIds: activeSession?.pinnedCases.map((item) => item.id),
      });
      if (!res.ok) {
        setError(`Copilot 请求失败：${res.error}`);
        return;
      }
      setQuestion('');
      if (inputRef.current) inputRef.current.value = '';
      await Promise.all([openSession(visitorId, res.data.sessionId), refreshSessions(visitorId)]);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCreateSession() {
    if (!visitorId || creatingSession) return;
    setCreatingSession(true);
    setError(null);
    try {
      const res = await createCopilotSessionAction(visitorId);
      if (!res.ok) {
        setError(`创建会话失败：${res.error}`);
        return;
      }
      applyActiveSession(res.data);
      await refreshSessions(visitorId);
      inputRef.current?.focus();
    } finally {
      setCreatingSession(false);
    }
  }

  async function handlePin(caseId: string) {
    if (!visitorId || !activeSessionId || pinningCaseId) return;
    setPinningCaseId(caseId);
    setError(null);
    try {
      const res = await pinCopilotCaseAction(visitorId, activeSessionId, caseId);
      if (!res.ok) {
        setError(`固定上下文失败：${res.error}`);
        return;
      }
      applyActiveSession(res.data);
      await refreshSessions(visitorId);
    } finally {
      setPinningCaseId(null);
    }
  }

  async function handleUnpin(caseId: string) {
    if (!visitorId || !activeSessionId || pinningCaseId) return;
    setPinningCaseId(caseId);
    setError(null);
    try {
      const res = await unpinCopilotCaseAction(visitorId, activeSessionId, caseId);
      if (!res.ok) {
        setError(`移除上下文失败：${res.error}`);
        return;
      }
      applyActiveSession(res.data);
      await refreshSessions(visitorId);
    } finally {
      setPinningCaseId(null);
    }
  }

  async function handleFeedback(messageId: string, vote: CopilotFeedbackVote) {
    if (!visitorId || !activeSessionId || feedbackingMessageId) return;
    setFeedbackingMessageId(messageId);
    setError(null);
    try {
      const res = await submitCopilotFeedbackAction(visitorId, messageId, vote);
      if (!res.ok) {
        setError(`反馈提交失败：${res.error}`);
        return;
      }
      await openSession(visitorId, activeSessionId);
    } finally {
      setFeedbackingMessageId(null);
    }
  }

  useEffect(() => {
    const presetQuestion = searchParams.get('q')?.trim() ?? '';
    if (!presetQuestion || !visitorId || bootstrapping) return;
    setQuestion(presetQuestion);
    if (inputRef.current) inputRef.current.value = presetQuestion;
    if (searchParams.get('run') !== '1') return;

    const key = `${visitorId}:${presetQuestion}`;
    if (initializedQuestionRef.current === key) return;
    initializedQuestionRef.current = key;
    void (async () => {
      setSubmitting(true);
      setError(null);
      try {
        const res = await askCopilotAction({
          visitorId,
          sessionId: activeSessionId ?? undefined,
          question: presetQuestion,
          topK: 5,
          pinnedCaseIds: activeSession?.pinnedCases.map((item) => item.id),
        });
        if (!res.ok) {
          setError(`Copilot 请求失败：${res.error}`);
          return;
        }
        setQuestion('');
        if (inputRef.current) inputRef.current.value = '';
        const [sessionRes, listRes] = await Promise.all([
          getCopilotSessionAction(visitorId, res.data.sessionId),
          listCopilotSessionsAction(visitorId),
        ]);
        if (sessionRes.ok) {
          applyActiveSession(sessionRes.data);
        } else {
          setError(`会话加载失败：${sessionRes.error}`);
        }
        if (listRes.ok) {
          setSessions(listRes.data);
        } else {
          setError(`会话列表加载失败：${listRes.error}`);
        }
      } finally {
        setSubmitting(false);
      }
    })();
  }, [searchParams, visitorId, bootstrapping, activeSessionId, activeSession]);

  const pinnedCaseIds = new Set(activeSession?.pinnedCases.map((item) => item.id) ?? []);

  return (
    <main style={{ maxWidth: 1320, margin: '0 auto', padding: '40px 24px 72px' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: 16,
          alignItems: 'end',
          flexWrap: 'wrap',
          marginBottom: 24,
        }}
      >
        <div>
          <Link href="/" style={{ color: '#9fb3ff', textDecoration: 'none', fontSize: 14 }}>
            ← 返回案例列表
          </Link>
          <p style={{ color: '#9fb3ff', fontSize: 13, letterSpacing: 1.2, margin: '20px 0 8px' }}>
            FAILURE COPILOT
          </p>
          <h1 style={{ fontSize: 36, lineHeight: 1.1, margin: '0 0 10px' }}>研究型失败问答工作台</h1>
          <p style={{ color: '#c8d0e5', lineHeight: 1.75, margin: 0, maxWidth: 780 }}>
            现在 Copilot 不再只是单轮回答。你可以保留研究线程、固定关键案例当作上下文，并对回答做反馈，逐步把“灵感问题”沉淀成可复用的研究会话。
          </p>
        </div>
        <button
          type="button"
          onClick={handleCreateSession}
          disabled={!visitorId || creatingSession}
          style={{
            padding: '12px 16px',
            borderRadius: 12,
            border: '1px solid #2a3658',
            background: creatingSession ? '#11182b' : '#5b7cff',
            color: '#fff',
            fontWeight: 700,
            cursor: !visitorId || creatingSession ? 'not-allowed' : 'pointer',
            opacity: !visitorId || creatingSession ? 0.6 : 1,
          }}
        >
          {creatingSession ? '创建中…' : '新建研究会话'}
        </button>
      </div>

      {error ? (
        <div
          style={{
            marginBottom: 18,
            borderRadius: 12,
            border: '1px solid rgba(255,138,101,0.4)',
            background: 'rgba(90,32,24,0.45)',
            padding: '12px 14px',
            color: '#ffd6cc',
          }}
        >
          {error}
        </div>
      ) : null}

      <section
        style={{
          display: 'grid',
          gridTemplateColumns: '320px minmax(0, 1fr)',
          gap: 18,
          alignItems: 'start',
        }}
      >
        <aside
          style={{
            borderRadius: 18,
            border: '1px solid #1d2746',
            background: '#10172b',
            padding: 16,
            position: 'sticky',
            top: 20,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
            <div>
              <div style={{ color: '#9fb3ff', fontSize: 12, letterSpacing: 1 }}>THREADS</div>
              <div style={{ fontSize: 22, fontWeight: 700, marginTop: 4 }}>研究会话</div>
            </div>
            <div style={{ color: '#6b7fa8', fontSize: 12 }}>{sessions.length} 条</div>
          </div>

          <div style={{ display: 'grid', gap: 10, marginTop: 16 }}>
            {bootstrapping ? (
              <div style={{ color: '#6b7fa8', fontSize: 14 }}>正在加载会话…</div>
            ) : sessions.length === 0 ? (
              <div
                style={{
                  borderRadius: 14,
                  border: '1px dashed #2a3658',
                  padding: 14,
                  color: '#9fb3ff',
                  lineHeight: 1.7,
                }}
              >
                还没有研究会话。直接提一个问题，或先新建一个线程再开始。
              </div>
            ) : (
              sessions.map((session) => (
                <button
                  key={session.id}
                  type="button"
                  onClick={() => visitorId && openSession(visitorId, session.id)}
                  style={{
                    textAlign: 'left',
                    borderRadius: 14,
                    border: session.id === activeSessionId ? '1px solid #5b7cff' : '1px solid #1d2746',
                    background: session.id === activeSessionId ? '#13203a' : '#0d1426',
                    padding: '14px 14px 12px',
                    color: '#f5f7fb',
                    cursor: 'pointer',
                    display: 'grid',
                    gap: 8,
                  }}
                >
                  <div style={{ fontSize: 15, fontWeight: 700, lineHeight: 1.4 }}>{session.title}</div>
                  <div style={{ color: '#9fb3ff', fontSize: 12, lineHeight: 1.6 }}>
                    {session.lastQuestion ? session.lastQuestion : '还没有提问'}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, color: '#6b7fa8', fontSize: 12 }}>
                    <span>{session.messageCount} 条消息</span>
                    <span>{session.pinnedCaseCount} 个 pinned</span>
                    <span>{formatSessionTime(session.updatedAt)}</span>
                  </div>
                </button>
              ))
            )}
          </div>
        </aside>

        <div style={{ display: 'grid', gap: 16 }}>
          <section
            style={{
              borderRadius: 18,
              border: '1px solid #1d2746',
              background:
                'radial-gradient(circle at top left, rgba(91,124,255,0.18), transparent 32%), #10172b',
              padding: '18px 20px',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: 12,
                flexWrap: 'wrap',
                alignItems: 'end',
              }}
            >
              <div>
                <div style={{ color: '#9fb3ff', fontSize: 12, letterSpacing: 1, marginBottom: 6 }}>
                  ACTIVE THREAD
                </div>
                <div style={{ fontSize: 24, fontWeight: 700 }}>
                  {activeSession?.session.title ?? '还没有激活会话'}
                </div>
                <div style={{ color: '#c8d0e5', marginTop: 8, lineHeight: 1.7, maxWidth: 760 }}>
                  {activeSession
                    ? '后续提问会继承当前线程历史；固定到上下文里的案例会被优先带入后续回答。'
                    : '先提一个问题，系统会自动创建线程；你也可以点击左上角按钮手动新建。'}
                </div>
              </div>
              {activeSession ? (
                <div style={{ color: '#6b7fa8', fontSize: 13 }}>
                  {activeSession.session.messageCount} 条消息 · {activeSession.pinnedCases.length} 个 pinned case
                </div>
              ) : null}
            </div>

            {activeSession?.pinnedCases.length ? (
              <div style={{ marginTop: 18 }}>
                <div style={{ color: '#9fb3ff', fontSize: 12, letterSpacing: 1, marginBottom: 10 }}>
                  PINNED CONTEXT
                </div>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                    gap: 10,
                  }}
                >
                  {activeSession.pinnedCases.map((item) => (
                    <div
                      key={item.id}
                      style={{
                        borderRadius: 14,
                        border: '1px solid #2a3658',
                        background: '#0d1426',
                        padding: '12px 14px',
                        display: 'grid',
                        gap: 8,
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                        <Link
                          href={caseListHref(item)}
                          style={{ color: '#f5f7fb', fontWeight: 700, textDecoration: 'none' }}
                        >
                          {item.companyName}
                        </Link>
                        <button
                          type="button"
                          onClick={() => handleUnpin(item.id)}
                          disabled={pinningCaseId === item.id}
                          style={{
                            border: 'none',
                            background: 'transparent',
                            color: '#ff8a65',
                            cursor: pinningCaseId === item.id ? 'not-allowed' : 'pointer',
                          }}
                        >
                          {pinningCaseId === item.id ? '移除中…' : '移除'}
                        </button>
                      </div>
                      <div style={{ color: '#9fb3ff', fontSize: 12 }}>
                        {industryLabel(item.industry)} · {countryLabel(item.country)}
                        {item.closedYear ? ` · ${item.closedYear}` : ''}
                      </div>
                      <div style={{ color: '#c8d0e5', fontSize: 13, lineHeight: 1.6 }}>{item.summary}</div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </section>

          <section
            style={{
              borderRadius: 18,
              border: '1px solid #1d2746',
              background: '#10172b',
              padding: 18,
              display: 'grid',
              gap: 14,
            }}
          >
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void handleSubmit(question);
              }}
              style={{ display: 'grid', gap: 12 }}
            >
              <textarea
                ref={inputRef}
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="问一个你真正关心的失败研究问题，例如：监管、扩张、履约、补贴、创始团队等如何共同导致崩盘？"
                rows={4}
                style={{
                  width: '100%',
                  borderRadius: 14,
                  border: '1px solid #24345b',
                  background: '#0d1426',
                  color: '#f5f7fb',
                  padding: '14px 16px',
                  resize: 'vertical',
                  fontSize: 15,
                  lineHeight: 1.7,
                }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ color: '#6b7fa8', fontSize: 12 }}>
                  {activeSession?.pinnedCases.length
                    ? `本轮会自动带入 ${activeSession.pinnedCases.length} 个 pinned case`
                    : '还没有 pinned context，可在回答引用里把关键案例固定下来'}
                </div>
                <button
                  type="submit"
                  disabled={!visitorId || submitting || question.trim().length < 2}
                  style={{
                    padding: '11px 18px',
                    borderRadius: 12,
                    border: 'none',
                    background: submitting ? '#2a3658' : '#5b7cff',
                    color: '#fff',
                    fontWeight: 700,
                    cursor:
                      !visitorId || submitting || question.trim().length < 2
                        ? 'not-allowed'
                        : 'pointer',
                    opacity: !visitorId || question.trim().length < 2 ? 0.6 : 1,
                  }}
                >
                  {submitting ? '分析中…' : activeSession ? '继续追问' : '开始研究'}
                </button>
              </div>
            </form>

            {!activeSession?.messages.length ? (
              <div>
                <div style={{ color: '#9fb3ff', fontSize: 12, letterSpacing: 1, marginBottom: 10 }}>
                  SUGGESTED STARTERS
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {SUGGESTED_QUESTIONS.map((item) => (
                    <button
                      key={item}
                      type="button"
                      onClick={() => {
                        setQuestion(item);
                        if (inputRef.current) inputRef.current.value = item;
                        void handleSubmit(item);
                      }}
                      disabled={submitting}
                      style={{
                        padding: '7px 14px',
                        borderRadius: 999,
                        border: '1px solid #2a3658',
                        background: '#11192f',
                        color: '#9fb3ff',
                        cursor: submitting ? 'not-allowed' : 'pointer',
                      }}
                    >
                      {item}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </section>

          <section style={{ display: 'grid', gap: 14 }}>
            {activeSession?.messages.length ? (
              activeSession.messages.map((message) => (
                <article
                  key={message.id}
                  style={{
                    borderRadius: 18,
                    border: message.role === 'assistant' ? '1px solid #233255' : '1px solid #1d2746',
                    background: message.role === 'assistant' ? '#10172b' : '#0d1426',
                    padding: '16px 18px',
                    display: 'grid',
                    gap: 12,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
                    <div style={{ fontWeight: 700, color: message.role === 'assistant' ? '#9fb3ff' : '#f5f7fb' }}>
                      {message.role === 'assistant' ? 'Copilot' : '你'}
                    </div>
                    <div style={{ color: '#6b7fa8', fontSize: 12 }}>{formatSessionTime(message.createdAt)}</div>
                  </div>

                  <div style={{ color: '#f5f7fb', lineHeight: 1.85, whiteSpace: 'pre-wrap' }}>{message.content}</div>

                  {message.role === 'assistant' ? (
                    <div style={{ display: 'grid', gap: 12 }}>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                        <span
                          style={{
                            padding: '4px 9px',
                            borderRadius: 999,
                            background: message.grounded ? 'rgba(24,185,129,0.15)' : 'rgba(255,138,101,0.15)',
                            color: message.grounded ? '#18b981' : '#ff8a65',
                            fontSize: 12,
                            fontWeight: 700,
                          }}
                        >
                          {message.grounded ? 'Grounded' : 'Rule-based'}
                        </span>
                        {message.model ? (
                          <span style={{ color: '#6b7fa8', fontSize: 12 }}>model: {message.model}</span>
                        ) : null}
                        {message.run ? (
                          <>
                            <span style={{ color: '#6b7fa8', fontSize: 12 }}>
                              prompt {message.run.promptVersion}
                            </span>
                            <span style={{ color: '#6b7fa8', fontSize: 12 }}>
                              {message.run.responseMs} ms
                            </span>
                            {message.run.totalTokens != null ? (
                              <span style={{ color: '#6b7fa8', fontSize: 12 }}>
                                {message.run.totalTokens} tok
                              </span>
                            ) : null}
                            {formatEstimatedCost(message.run.estimatedCostUsd) ? (
                              <span style={{ color: '#6b7fa8', fontSize: 12 }}>
                                {formatEstimatedCost(message.run.estimatedCostUsd)}
                              </span>
                            ) : null}
                            {fallbackReasonLabel(message.run.fallbackReason) ? (
                              <span style={{ color: '#ff8a65', fontSize: 12 }}>
                                {fallbackReasonLabel(message.run.fallbackReason)}
                              </span>
                            ) : null}
                          </>
                        ) : null}
                      </div>

                      {message.citations.length ? (
                        <div>
                          <div style={{ color: '#9fb3ff', fontSize: 12, letterSpacing: 1, marginBottom: 10 }}>
                            CITATIONS
                          </div>
                          <div
                            style={{
                              display: 'grid',
                              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                              gap: 10,
                            }}
                          >
                            {message.citations.map((citation) => {
                              const pinned = pinnedCaseIds.has(citation.caseId);
                              return (
                                <div
                                  key={`${message.id}-${citation.caseId}`}
                                  style={{
                                    borderRadius: 14,
                                    border: '1px solid #1d2746',
                                    background: '#0d1426',
                                    padding: '12px 14px',
                                    display: 'grid',
                                    gap: 8,
                                  }}
                                >
                                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                                    <Link
                                      href={`/cases/s/${encodeURIComponent(citation.slug)}`}
                                      style={{ color: '#f5f7fb', textDecoration: 'none', fontWeight: 700 }}
                                    >
                                      {citation.companyName}
                                    </Link>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        pinned ? handleUnpin(citation.caseId) : handlePin(citation.caseId)
                                      }
                                      disabled={pinningCaseId === citation.caseId}
                                      style={{
                                        border: 'none',
                                        background: 'transparent',
                                        color: pinned ? '#18b981' : '#9fb3ff',
                                        cursor: pinningCaseId === citation.caseId ? 'not-allowed' : 'pointer',
                                        fontWeight: 700,
                                      }}
                                    >
                                      {pinningCaseId === citation.caseId
                                        ? '处理中…'
                                        : pinned
                                          ? '已固定'
                                          : '固定上下文'}
                                    </button>
                                  </div>
                                  <div style={{ color: '#c8d0e5', fontSize: 13, lineHeight: 1.6 }}>
                                    {citation.relevantText}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ) : null}

                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        {(['up', 'down'] as const).map((vote) => {
                          const active = message.feedbackVote === vote;
                          return (
                            <button
                              key={vote}
                              type="button"
                              onClick={() => handleFeedback(message.id, vote)}
                              disabled={feedbackingMessageId === message.id}
                              style={{
                                padding: '7px 12px',
                                borderRadius: 999,
                                border: active ? '1px solid #5b7cff' : '1px solid #2a3658',
                                background: active ? '#13203a' : '#0d1426',
                                color: active ? '#9fb3ff' : '#c8d0e5',
                                cursor: feedbackingMessageId === message.id ? 'not-allowed' : 'pointer',
                              }}
                            >
                              {feedbackingMessageId === message.id
                                ? '提交中…'
                                : vote === 'up'
                                  ? '有帮助'
                                  : '需要改进'}
                            </button>
                          );
                        })}
                        {message.feedbackVote ? (
                          <span style={{ color: '#6b7fa8', fontSize: 12, alignSelf: 'center' }}>
                            当前反馈：{message.feedbackVote === 'up' ? '有帮助' : '需要改进'}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                </article>
              ))
            ) : (
              <div
                style={{
                  borderRadius: 18,
                  border: '1px dashed #2a3658',
                  background: '#10172b',
                  padding: '24px 20px',
                  color: '#9fb3ff',
                  lineHeight: 1.8,
                }}
              >
                这里会显示研究会话的消息流。开始提问后，你可以把引用案例固定到上下文里，再围绕它们连续追问。
              </div>
            )}
          </section>
        </div>
      </section>
    </main>
  );
}
