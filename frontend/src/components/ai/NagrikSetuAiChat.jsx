import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { API_URL } from '../../utils/api.js'

const SUGGESTED_QUESTIONS = [
  'Find government schools near me.',
  'Which scholarships are available in Karnataka?',
  'What are the admission requirements?',
  'How can I find schools by district?'
]

// Helper to format inline markdown (bold, code, links)
function renderInlineContent(text) {
  if (!text) return null
  // Regex to match URLs, /schools/ paths, bold, and inline code
  const tokens = []
  let remaining = text

  // Replace markdown elements
  // We can do a simple parser for bold **text**, inline code `code`, URLs, and /schools/ paths
  const parts = remaining.split(/(\*\*.*?\*\*|`.*?`|(?:https?:\/\/[^\s]+)|\/schools\/[A-Za-z0-9]+)/g)

  return parts.map((part, idx) => {
    if (!part) return null

    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={idx}>{part.slice(2, -2)}</strong>
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return (
        <code
          key={idx}
          style={{
            backgroundColor: '#e2e8f0',
            color: '#0f172a',
            padding: '2px 5px',
            borderRadius: '4px',
            fontSize: '0.9em',
            fontFamily: 'monospace'
          }}
        >
          {part.slice(1, -1)}
        </code>
      )
    }
    if (part.startsWith('http://') || part.startsWith('https://')) {
      return (
        <a
          key={idx}
          href={part}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: '#0284c7', textDecoration: 'underline', wordBreak: 'break-all' }}
        >
          {part}
        </a>
      )
    }
    if (part.startsWith('/schools/')) {
      return (
        <Link
          key={idx}
          to={part}
          style={{ color: '#0284c7', fontWeight: '600', textDecoration: 'underline' }}
        >
          {part}
        </Link>
      )
    }
    return part
  })
}

// Helper to format whole message block (handles markdown tables, bullet lists, paragraphs)
function FormattedMessageContent({ text }) {
  if (!text) return null

  // Check if message contains markdown table
  if (text.includes('|') && text.includes('---')) {
    const lines = text.split('\n')
    const tableLines = []
    const otherLinesBefore = []
    const otherLinesAfter = []
    let inTable = false
    let tableDone = false

    for (const line of lines) {
      if (line.trim().startsWith('|') && line.trim().endsWith('|')) {
        inTable = true
        tableLines.push(line.trim())
      } else if (inTable && !tableDone) {
        tableDone = true
        otherLinesAfter.push(line)
      } else if (!inTable) {
        otherLinesBefore.push(line)
      } else {
        otherLinesAfter.push(line)
      }
    }

    if (tableLines.length >= 3) {
      const headerCols = tableLines[0].split('|').filter(c => c.trim().length > 0)
      const dataRows = tableLines.slice(2).map(row => row.split('|').filter(c => c.trim().length > 0))

      return (
        <div>
          {otherLinesBefore.length > 0 && (
            <div style={{ marginBottom: '10px' }}>
              <FormattedMessageContent text={otherLinesBefore.join('\n')} />
            </div>
          )}
          <div style={{ overflowX: 'auto', margin: '10px 0' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', backgroundColor: '#ffffff', borderRadius: '6px', overflow: 'hidden' }}>
              <thead>
                <tr style={{ backgroundColor: '#0B2545', color: '#ffffff' }}>
                  {headerCols.map((h, i) => (
                    <th key={i} style={{ padding: '8px 12px', textAlign: 'left', fontWeight: '600', border: '1px solid #cbd5e1' }}>
                      {renderInlineContent(h.trim())}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {dataRows.map((row, rIdx) => (
                  <tr key={rIdx} style={{ backgroundColor: rIdx % 2 === 0 ? '#f8fafc' : '#ffffff' }}>
                    {row.map((cell, cIdx) => (
                      <td key={cIdx} style={{ padding: '8px 12px', border: '1px solid #cbd5e1' }}>
                        {renderInlineContent(cell.trim())}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {otherLinesAfter.length > 0 && (
            <div style={{ marginTop: '10px' }}>
              <FormattedMessageContent text={otherLinesAfter.join('\n')} />
            </div>
          )}
        </div>
      )
    }
  }

  // Split into paragraphs / bullet lines
  const paragraphs = text.split('\n\n')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {paragraphs.map((para, pIdx) => {
        const lines = para.split('\n')
        const isBulletList = lines.every(l => l.trim().startsWith('•') || l.trim().startsWith('-') || l.trim().startsWith('*') || l.trim().length === 0)

        if (isBulletList && lines.some(l => l.trim().length > 0)) {
          return (
            <ul key={pIdx} style={{ margin: '4px 0', paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {lines.filter(l => l.trim().length > 0).map((l, lIdx) => {
                const cleaned = l.replace(/^[•\-*]\s*/, '')
                return <li key={lIdx}>{renderInlineContent(cleaned)}</li>
              })}
            </ul>
          )
        }

        return (
          <div key={pIdx} style={{ lineHeight: '1.6' }}>
            {lines.map((l, lIdx) => (
              <div key={lIdx} style={{ margin: l.trim().startsWith('•') || l.trim().startsWith('-') ? '2px 0 2px 14px' : '0' }}>
                {renderInlineContent(l)}
              </div>
            ))}
          </div>
        )
      })}
    </div>
  )
}

export default function NagrikSetuAiChat({ isFullPage = true, onClose = null }) {
  const [messages, setMessages] = useState([])
  const [inputValue, setInputValue] = useState('')
  const [loading, setLoading] = useState(false)
  const [sessionId, setSessionId] = useState(() => 'sess_' + Math.random().toString(36).substring(2, 10))
  const messagesEndRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  function handleSend(queryText = null) {
    const textToSend = (queryText || inputValue).trim()
    if (!textToSend || loading) return

    const userMsg = {
      id: 'usr_' + Date.now(),
      sender: 'user',
      text: textToSend,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }

    setMessages(prev => [...prev, userMsg])
    setInputValue('')
    setLoading(true)

    const token = localStorage.getItem('token')
    const headers = {
      'Content-Type': 'application/json'
    }
    if (token) {
      headers['Authorization'] = `Bearer ${token}`
    }

    fetch(`${API_URL}/ai/chat`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        message: textToSend,
        prompt: textToSend,
        session_id: sessionId
      })
    })
      .then(async res => {
        if (!res.ok) {
          let errDetail = `Server returned status ${res.status}`
          try {
            const errData = await res.json()
            if (typeof errData.detail === 'string') {
              errDetail = errData.detail
            } else if (Array.isArray(errData.detail)) {
              errDetail = errData.detail.map(d => d.msg || (typeof d === 'string' ? d : JSON.stringify(d))).join(', ')
            } else if (errData.message && typeof errData.message === 'string') {
              errDetail = errData.message
            } else if (errData.detail && typeof errData.detail === 'object') {
              errDetail = JSON.stringify(errData.detail)
            }
          } catch {
            // response was not JSON
          }
          throw new Error(errDetail)
        }
        return res.json()
      })
      .then(data => {
        const aiMsg = {
          id: 'ai_' + Date.now(),
          sender: 'assistant',
          text: data.response || 'No response returned from the AI assistant.',
          sources: data.grounded_sources || [],
          actions: data.suggested_actions || [],
          matched_question: data.matched_question,
          intent: data.intent,
          category: data.category,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
        if (data.session_id) {
          setSessionId(data.session_id)
        }
        setMessages(prev => [...prev, aiMsg])
      })
      .catch(err => {
        let cleanError = 'Unable to complete your request. Please verify your connection or try again.'
        if (err && err.message && typeof err.message === 'string' && !err.message.includes('[object Object]')) {
          cleanError = err.message
        }

        const errorMsg = {
          id: 'err_' + Date.now(),
          sender: 'assistant',
          isError: true,
          failedText: textToSend,
          text: cleanError,
          sources: [],
          actions: [],
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
        setMessages(prev => [...prev, errorMsg])
      })
      .finally(() => {
        setLoading(false)
        setTimeout(() => inputRef.current?.focus(), 100)
      })
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  function handleNewConversation() {
    setMessages([])
    setSessionId('sess_' + Math.random().toString(36).substring(2, 10))
    setInputValue('')
    setTimeout(() => inputRef.current?.focus(), 100)
  }

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: isFullPage ? 'calc(100vh - 140px)' : '580px',
      maxHeight: isFullPage ? '820px' : '620px',
      backgroundColor: '#ffffff',
      borderRadius: isFullPage ? '10px' : '12px',
      border: '1px solid #cbd5e1',
      boxShadow: isFullPage ? '0 4px 20px rgba(11,37,69,0.08)' : '0 12px 36px rgba(11,37,69,0.18)',
      overflow: 'hidden',
      fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    }}>
      {/* 1. Header: Clean, Authoritative, NO technical status noise */}
      <div style={{
        backgroundColor: '#0B2545',
        color: '#ffffff',
        padding: '14px 20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderBottom: '2px solid #134074'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {/* Government-grade trust emblem */}
          <div style={{
            width: '38px',
            height: '38px',
            borderRadius: '50%',
            backgroundColor: '#134074',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#67e8f9',
            fontWeight: '800',
            fontSize: '15px',
            border: '2px solid #00b4d8',
            boxShadow: '0 2px 8px rgba(0,0,0,0.2)'
          }}>
            NS
          </div>
          <div>
            <div style={{ fontSize: '16px', fontWeight: '700', letterSpacing: '0.2px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              NagrikSetu AI
              <span style={{
                fontSize: '10px',
                padding: '2px 8px',
                borderRadius: '10px',
                backgroundColor: 'rgba(255,255,255,0.15)',
                color: '#67e8f9',
                fontWeight: '600',
                letterSpacing: '0.5px',
                textTransform: 'uppercase'
              }}>
                Official
              </span>
            </div>
            <div style={{ fontSize: '12px', color: '#cbd5e1', marginTop: '1px' }}>
              Your Karnataka Education Assistant
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            onClick={handleNewConversation}
            title="Start New Conversation"
            style={{
              background: 'rgba(255, 255, 255, 0.1)',
              border: '1px solid rgba(255, 255, 255, 0.25)',
              color: '#ffffff',
              padding: '6px 14px',
              borderRadius: '6px',
              fontSize: '12px',
              cursor: 'pointer',
              fontWeight: '600',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'all 0.2s'
            }}
            onMouseOver={e => e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.2)'}
            onMouseOut={e => e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.1)'}
          >
            <span>🔄</span> New Chat
          </button>

          {onClose && (
            <button
              onClick={onClose}
              title="Close chat"
              style={{
                background: 'transparent',
                border: 'none',
                color: '#ffffff',
                fontSize: '22px',
                cursor: 'pointer',
                padding: '4px 6px',
                lineHeight: '1',
                opacity: 0.8
              }}
              onMouseOver={e => e.currentTarget.style.opacity = '1'}
              onMouseOut={e => e.currentTarget.style.opacity = '0.8'}
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* 2. Conversation / Message Area */}
      <div style={{
        flex: 1,
        padding: '20px',
        overflowY: 'auto',
        backgroundColor: '#f8fafc',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px'
      }}>
        {/* Welcome State when no messages have been sent */}
        {messages.length === 0 && (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            textAlign: 'center',
            padding: isFullPage ? '40px 20px' : '20px 10px',
            maxWidth: '600px',
            margin: 'auto'
          }}>
            <div style={{
              width: '56px',
              height: '56px',
              borderRadius: '50%',
              backgroundColor: '#e0f2fe',
              color: '#0369a1',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '28px',
              marginBottom: '16px',
              boxShadow: '0 4px 12px rgba(3,105,161,0.12)'
            }}>
              👋
            </div>
            <h2 style={{
              fontSize: '20px',
              fontWeight: '700',
              color: '#0B2545',
              margin: '0 0 8px 0'
            }}>
              Hello! How can I help you today?
            </h2>
            <p style={{
              fontSize: '14px',
              color: '#475569',
              lineHeight: '1.5',
              margin: '0 0 24px 0'
            }}>
              I can help you explore schools, understand admissions, find scholarships and discover educational opportunities across Karnataka.
            </p>

            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
              gap: '10px',
              width: '100%'
            }}>
              {SUGGESTED_QUESTIONS.map((question, qIdx) => (
                <button
                  key={qIdx}
                  onClick={() => handleSend(question)}
                  disabled={loading}
                  style={{
                    backgroundColor: '#ffffff',
                    border: '1px solid #cbd5e1',
                    borderRadius: '8px',
                    padding: '12px 14px',
                    textAlign: 'left',
                    fontSize: '13px',
                    fontWeight: '500',
                    color: '#1e293b',
                    cursor: 'pointer',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.02)',
                    transition: 'all 0.2s',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}
                  onMouseOver={e => {
                    e.currentTarget.style.borderColor = '#0284c7'
                    e.currentTarget.style.backgroundColor = '#f0f9ff'
                    e.currentTarget.style.transform = 'translateY(-1px)'
                  }}
                  onMouseOut={e => {
                    e.currentTarget.style.borderColor = '#cbd5e1'
                    e.currentTarget.style.backgroundColor = '#ffffff'
                    e.currentTarget.style.transform = 'translateY(0)'
                  }}
                >
                  <span style={{ color: '#0284c7', fontSize: '14px' }}>💬</span>
                  <span>{question}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Message Stream */}
        {messages.map(msg => (
          <div
            key={msg.id}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: msg.sender === 'user' ? 'flex-end' : 'flex-start',
              maxWidth: '100%'
            }}
          >
            {/* Sender & Timestamp */}
            <div style={{
              fontSize: '11px',
              color: '#64748b',
              marginBottom: '4px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}>
              <span>{msg.sender === 'user' ? 'You' : 'NagrikSetu AI'}</span>
              <span>•</span>
              <span>{msg.timestamp}</span>
            </div>

            {/* Bubble */}
            <div style={{
              display: 'flex',
              gap: '10px',
              maxWidth: msg.sender === 'user' ? '80%' : '88%',
              alignItems: 'flex-start'
            }}>
              {msg.sender === 'assistant' && (
                <div style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  backgroundColor: '#134074',
                  color: '#ffffff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: '700',
                  fontSize: '12px',
                  flexShrink: 0,
                  marginTop: '2px',
                  border: '1px solid #00b4d8'
                }}>
                  AI
                </div>
              )}

              <div style={{
                padding: '14px 18px',
                borderRadius: msg.sender === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                backgroundColor: msg.sender === 'user' ? '#134074' : msg.isError ? '#fef2f2' : '#ffffff',
                color: msg.sender === 'user' ? '#ffffff' : msg.isError ? '#991b1b' : '#1e293b',
                border: msg.sender === 'user' ? 'none' : msg.isError ? '1px solid #fecaca' : '1px solid #e2e8f0',
                boxShadow: msg.sender === 'user' ? '0 2px 6px rgba(19,64,116,0.2)' : '0 2px 6px rgba(0,0,0,0.04)',
                fontSize: '14px',
                wordBreak: 'break-word',
                width: '100%'
              }}>
                {msg.isError ? (
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: '600', marginBottom: '6px' }}>
                      <span>⚠️</span>
                      <span>Unable to complete request</span>
                    </div>
                    <div style={{ fontSize: '13px', color: '#7f1d1d', marginBottom: '12px', lineHeight: '1.5' }}>
                      {msg.text}
                    </div>
                    {msg.failedText && (
                      <button
                        onClick={() => handleSend(msg.failedText)}
                        disabled={loading}
                        style={{
                          backgroundColor: '#b91c1c',
                          color: '#ffffff',
                          border: 'none',
                          padding: '6px 14px',
                          borderRadius: '4px',
                          fontSize: '12px',
                          fontWeight: '600',
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          transition: 'background-color 0.2s'
                        }}
                        onMouseOver={e => e.currentTarget.style.backgroundColor = '#991b1b'}
                        onMouseOut={e => e.currentTarget.style.backgroundColor = '#b91c1c'}
                      >
                        🔄 Retry
                      </button>
                    )}
                  </div>
                ) : (
                  <>
                    <FormattedMessageContent text={msg.text} />

                    {/* Grounded Sources */}
                    {msg.sources && msg.sources.length > 0 && (
                      <div style={{
                        marginTop: '12px',
                        paddingTop: '8px',
                        borderTop: '1px solid #f1f5f9',
                        fontSize: '11px',
                        color: '#64748b'
                      }}>
                        <strong style={{ color: '#0369a1' }}>Data Sources:</strong>{' '}
                        {msg.sources.join(' • ')}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Suggested Follow-up Actions */}
            {msg.actions && msg.actions.length > 0 && !msg.isError && (
              <div style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: '8px',
                marginTop: '8px',
                marginLeft: '42px',
                maxWidth: '85%'
              }}>
                {msg.actions.map((act, i) => (
                  <button
                    key={i}
                    onClick={() => handleSend(act)}
                    disabled={loading}
                    style={{
                      backgroundColor: '#f1f5f9',
                      border: '1px solid #cbd5e1',
                      borderRadius: '16px',
                      padding: '4px 12px',
                      fontSize: '12px',
                      color: '#1e293b',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                      textAlign: 'left'
                    }}
                    onMouseOver={e => {
                      e.currentTarget.style.backgroundColor = '#e2e8f0'
                      e.currentTarget.style.borderColor = '#94a3b8'
                    }}
                    onMouseOut={e => {
                      e.currentTarget.style.backgroundColor = '#f1f5f9'
                      e.currentTarget.style.borderColor = '#cbd5e1'
                    }}
                  >
                    💬 {act}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}

        {/* Loading / Thinking Indicator */}
        {loading && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: '10px 16px',
            backgroundColor: '#ffffff',
            borderRadius: '16px 16px 16px 4px',
            border: '1px solid #e2e8f0',
            width: 'fit-content',
            boxShadow: '0 2px 6px rgba(0,0,0,0.04)'
          }}>
            <div style={{
              width: '28px',
              height: '28px',
              borderRadius: '50%',
              backgroundColor: '#134074',
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: '700',
              fontSize: '11px',
              flexShrink: 0
            }}>
              AI
            </div>
            <div style={{ fontSize: '13px', color: '#475569', fontStyle: 'italic' }}>
              NagrikSetu AI is thinking...
            </div>
            <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
              <span style={{ width: '6px', height: '6px', backgroundColor: '#0284c7', borderRadius: '50%', display: 'inline-block', animation: 'bounce 1s infinite' }} />
              <span style={{ width: '6px', height: '6px', backgroundColor: '#0284c7', borderRadius: '50%', display: 'inline-block', animation: 'bounce 1s infinite 0.2s' }} />
              <span style={{ width: '6px', height: '6px', backgroundColor: '#0284c7', borderRadius: '50%', display: 'inline-block', animation: 'bounce 1s infinite 0.4s' }} />
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* 3. Input Bar */}
      <div style={{
        padding: '14px 20px',
        backgroundColor: '#ffffff',
        borderTop: '1px solid #e2e8f0',
        display: 'flex',
        gap: '12px',
        alignItems: 'center'
      }}>
        <textarea
          ref={inputRef}
          value={inputValue}
          onChange={e => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask anything about schools, admissions, scholarships..."
          rows={1}
          disabled={loading}
          style={{
            flex: 1,
            padding: '12px 16px',
            borderRadius: '24px',
            border: '1px solid #cbd5e1',
            fontSize: '14px',
            outline: 'none',
            resize: 'none',
            fontFamily: 'inherit',
            lineHeight: '1.4',
            boxSizing: 'border-box',
            backgroundColor: '#f8fafc',
            transition: 'border-color 0.2s, background-color 0.2s'
          }}
          onFocus={e => {
            e.target.style.borderColor = '#0284c7'
            e.target.style.backgroundColor = '#ffffff'
          }}
          onBlur={e => {
            e.target.style.borderColor = '#cbd5e1'
            e.target.style.backgroundColor = '#f8fafc'
          }}
        />

        <button
          onClick={() => handleSend()}
          disabled={loading || !inputValue.trim()}
          title="Send message"
          style={{
            backgroundColor: inputValue.trim() && !loading ? '#0B2545' : '#cbd5e1',
            color: '#ffffff',
            border: 'none',
            width: '42px',
            height: '42px',
            borderRadius: '50%',
            fontWeight: '600',
            fontSize: '16px',
            cursor: inputValue.trim() && !loading ? 'pointer' : 'not-allowed',
            transition: 'all 0.2s',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            boxShadow: inputValue.trim() && !loading ? '0 2px 8px rgba(11,37,69,0.25)' : 'none'
          }}
          onMouseOver={e => {
            if (inputValue.trim() && !loading) {
              e.currentTarget.style.backgroundColor = '#134074'
              e.currentTarget.style.transform = 'scale(1.05)'
            }
          }}
          onMouseOut={e => {
            if (inputValue.trim() && !loading) {
              e.currentTarget.style.backgroundColor = '#0B2545'
              e.currentTarget.style.transform = 'scale(1)'
            }
          }}
        >
          ➤
        </button>
      </div>
    </div>
  )
}
