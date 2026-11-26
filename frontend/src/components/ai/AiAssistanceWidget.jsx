import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import NagrikSetuAiChat from './NagrikSetuAiChat.jsx'

export default function AiAssistanceWidget() {
  const [isOpen, setIsOpen] = useState(false)
  const location = useLocation()

  // Don't show floating widget if user is already on the dedicated /ai-assistance page
  if (location.pathname === '/ai-assistance') {
    return null
  }

  return (
    <div style={{
      position: 'fixed',
      bottom: '24px',
      right: '24px',
      zIndex: 9999,
      fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    }}>
      {/* Floating Chat Modal */}
      {isOpen && (
        <div style={{
          position: 'absolute',
          bottom: '72px',
          right: '0',
          width: '420px',
          maxWidth: 'calc(100vw - 32px)',
          height: '600px',
          maxHeight: 'calc(100vh - 120px)',
          zIndex: 10000,
          boxShadow: '0 16px 48px rgba(11,37,69,0.22)',
          borderRadius: '12px',
          display: 'flex',
          flexDirection: 'column',
          animation: 'fadeInUp 0.25s ease-out'
        }}>
          {/* Top subtle bar with Open Full Page link */}
          <div style={{
            display: 'flex',
            justifyContent: 'flex-end',
            marginBottom: '6px'
          }}>
            <Link
              to="/ai-assistance"
              onClick={() => setIsOpen(false)}
              style={{
                backgroundColor: '#ffffff',
                color: '#0B2545',
                padding: '4px 12px',
                borderRadius: '6px',
                fontSize: '11px',
                fontWeight: '600',
                textDecoration: 'none',
                boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
                border: '1px solid #cbd5e1',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                transition: 'all 0.2s'
              }}
              onMouseOver={e => e.currentTarget.style.backgroundColor = '#f1f5f9'}
              onMouseOut={e => e.currentTarget.style.backgroundColor = '#ffffff'}
            >
              <span>⤢</span> Full Page View
            </Link>
          </div>

          <div style={{ flex: 1, minHeight: 0 }}>
            <NagrikSetuAiChat isFullPage={false} onClose={() => setIsOpen(false)} />
          </div>
        </div>
      )}

      {/* Floating Trigger Button */}
      <button
        onClick={() => setIsOpen(prev => !prev)}
        title={isOpen ? "Close NagrikSetu AI" : "Open NagrikSetu AI Assistant"}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          backgroundColor: '#0B2545',
          color: '#ffffff',
          border: '2px solid #134074',
          borderRadius: '30px',
          padding: '12px 22px',
          boxShadow: '0 6px 20px rgba(11,37,69,0.28)',
          cursor: 'pointer',
          fontWeight: '700',
          fontSize: '14px',
          letterSpacing: '0.2px',
          transition: 'all 0.2s ease',
          outline: 'none'
        }}
        onMouseOver={e => {
          e.currentTarget.style.backgroundColor = '#134074'
          e.currentTarget.style.transform = 'translateY(-2px)'
          e.currentTarget.style.boxShadow = '0 8px 24px rgba(11,37,69,0.35)'
        }}
        onMouseOut={e => {
          e.currentTarget.style.backgroundColor = '#0B2545'
          e.currentTarget.style.transform = 'translateY(0)'
          e.currentTarget.style.boxShadow = '0 6px 20px rgba(11,37,69,0.28)'
        }}
      >
        <span style={{ fontSize: '18px' }}>{isOpen ? '✕' : '💬'}</span>
        <span>{isOpen ? 'Close' : 'NagrikSetu AI'}</span>
        {!isOpen && (
          <span style={{
            backgroundColor: '#0284c7',
            color: '#ffffff',
            fontSize: '9px',
            fontWeight: '800',
            padding: '2px 7px',
            borderRadius: '10px',
            textTransform: 'uppercase',
            letterSpacing: '0.5px'
          }}>
            Ask
          </span>
        )}
      </button>
    </div>
  )
}
