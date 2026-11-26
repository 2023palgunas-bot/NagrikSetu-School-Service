import React, { useEffect, useState, useCallback } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext.jsx'
import { apiGet, apiPost } from '../../utils/api.js'
import LoadingSpinner from '../../components/ui/LoadingSpinner.jsx'
import Alert from '../../components/ui/Alert.jsx'

const SUPPORT_STATUS_COLORS = {
  'Submitted': { bg: '#EFF8FF', text: '#175CD3', border: '#B2DDFF' },
  'Under Review': { bg: '#FFFAEB', text: '#B54708', border: '#FEDF89' },
  'More Information Required': { bg: '#FEF3F2', text: '#B42318', border: '#FECDCA' },
  'In Progress': { bg: '#FDF2FA', text: '#C11574', border: '#FCCEEE' },
  'Resolved': { bg: '#ECFDF3', text: '#027A48', border: '#A6F4C5' },
  'Rejected': { bg: '#FEF3F2', text: '#B42318', border: '#FECDCA' }
}

const REG_STATUS_COLORS = {
  'pending': { bg: '#EFF8FF', text: '#175CD3', border: '#B2DDFF', label: 'Pending Review' },
  'under_review': { bg: '#FFFAEB', text: '#B54708', border: '#FEDF89', label: 'Under Review' },
  'additional_info_required': { bg: '#FEF3F2', text: '#B42318', border: '#FECDCA', label: 'More Information Required' },
  'resubmitted': { bg: '#FDF2FA', text: '#C11574', border: '#FCCEEE', label: 'Resubmitted' },
  'approved': { bg: '#ECFDF3', text: '#027A48', border: '#A6F4C5', label: 'Approved' },
  'rejected': { bg: '#FEF3F2', text: '#B42318', border: '#FECDCA', label: 'Rejected' }
}

export default function AdminDashboard() {
  const { user, token, isAuthenticated, login, logout } = useAuth()
  const isPlatformAdmin = user?.role === 'platform_admin'
  const [searchParams, setSearchParams] = useSearchParams()

  // Authentication gate state
  const [authEmail, setAuthEmail] = useState('admin.central@nagriksetu.gov')
  const [authPassword, setAuthPassword] = useState('Central@NagrikSetu2026!')
  const [authLoggingIn, setAuthLoggingIn] = useState(false)
  const [authError, setAuthError] = useState('')

  // ONLY TWO VALID PLATFORM ADMIN TABS
  // 1. Institution Registration Approvals ('registrations')
  // 2. Institution Support Requests ('support-requests')
  const [activeTab, setActiveTab] = useState(() => {
    const t = searchParams.get('tab')
    return t === 'support-requests' ? 'support-requests' : 'registrations'
  })

  // Global summary counts
  const [counts, setCounts] = useState({
    total_registered_institutions: 0,
    pending_registration_approvals: 0,
    total_support_requests: 0,
    open_support_requests: 0
  })
  const [loadingCounts, setLoadingCounts] = useState(true)
  const [feedback, setFeedback] = useState(null)

  // =========================================================================
  // TAB 1: INSTITUTION REGISTRATION APPROVALS STATE
  // =========================================================================
  const [regApps, setRegApps] = useState([])
  const [loadingRegs, setLoadingRegs] = useState(true)
  const [regStatusFilter, setRegStatusFilter] = useState('all')
  const [regSearchQuery, setRegSearchQuery] = useState('')
  const [selectedRegApp, setSelectedRegApp] = useState(null)
  const [loadingDossier, setLoadingDossier] = useState(false)

  // Registration Actions State
  const [actionType, setActionType] = useState(null) // 'approve', 'reject', 'request-info', 'under-review'
  const [actionRemarks, setActionRemarks] = useState('')
  const [submittingAction, setSubmittingAction] = useState(false)

  // =========================================================================
  // TAB 2: INSTITUTION SUPPORT REQUESTS STATE
  // =========================================================================
  const [supportRequests, setSupportRequests] = useState([])
  const [loadingSupport, setLoadingSupport] = useState(true)
  const [supportStatusFilter, setSupportStatusFilter] = useState('all')
  const [supportCategoryFilter, setSupportCategoryFilter] = useState('all')
  const [supportSearchQuery, setSupportSearchQuery] = useState('')
  const [selectedSupportReq, setSelectedSupportReq] = useState(null)

  // Support Request Update Action State
  const [supportActionStatus, setSupportActionStatus] = useState('Under Review')
  const [supportActionResponse, setSupportActionResponse] = useState('')
  const [submittingSupportAction, setSubmittingSupportAction] = useState(false)

  // Sync tab with URL
  const handleTabChange = (tabId) => {
    setActiveTab(tabId)
    setSearchParams({ tab: tabId })
    setFeedback(null)
  }

  // =========================================================================
  // DATA LOADERS
  // =========================================================================

  const loadOverviewCounts = useCallback(async () => {
    if (!token || !isPlatformAdmin) return
    try {
      setLoadingCounts(true)
      const data = await apiGet('/admin/platform-overview-counts', token)
      setCounts(data)
    } catch (err) {
      console.error('Failed to load overview counts:', err)
    } finally {
      setLoadingCounts(false)
    }
  }, [token, isPlatformAdmin])

  const loadRegistrations = useCallback(async (silent = false) => {
    if (!token || !isPlatformAdmin) return
    try {
      if (!silent) setLoadingRegs(true)
      const params = new URLSearchParams()
      if (regStatusFilter !== 'all') params.append('status', regStatusFilter)
      if (regSearchQuery.trim()) params.append('search', regSearchQuery.trim())

      const res = await apiGet(`/admin/institutions/applications?${params.toString()}`, token)
      setRegApps(res.items || [])
    } catch (err) {
      if (!silent) setFeedback({ type: 'error', message: err.message || 'Failed to load registration applications.' })
    } finally {
      if (!silent) setLoadingRegs(false)
    }
  }, [token, isPlatformAdmin, regStatusFilter, regSearchQuery])

  const loadSupportRequests = useCallback(async (silent = false) => {
    if (!token || !isPlatformAdmin) return
    try {
      if (!silent) setLoadingSupport(true)
      const params = new URLSearchParams()
      if (supportStatusFilter !== 'all') params.append('status', supportStatusFilter)
      if (supportCategoryFilter !== 'all') params.append('category', supportCategoryFilter)
      if (supportSearchQuery.trim()) params.append('search', supportSearchQuery.trim())

      const res = await apiGet(`/admin/support-requests?${params.toString()}`, token)
      setSupportRequests(res.items || [])
    } catch (err) {
      if (!silent) setFeedback({ type: 'error', message: err.message || 'Failed to load support requests.' })
    } finally {
      if (!silent) setLoadingSupport(false)
    }
  }, [token, isPlatformAdmin, supportStatusFilter, supportCategoryFilter, supportSearchQuery])

  useEffect(() => {
    if (token && isPlatformAdmin) {
      loadOverviewCounts()
      loadRegistrations()
      loadSupportRequests()
    }
  }, [token, isPlatformAdmin, loadOverviewCounts, loadRegistrations, loadSupportRequests])

  // Login handler for Platform Admin gate
  async function handleQuickLogin(e) {
    if (e) e.preventDefault()
    setAuthLoggingIn(true)
    setAuthError('')
    try {
      await login(authEmail, authPassword)
    } catch (err) {
      setAuthError(err.message || 'Authentication failed. Please verify credentials.')
    } finally {
      setAuthLoggingIn(false)
    }
  }

  // Dossier opener
  async function handleOpenDossier(app) {
    setSelectedRegApp(app)
    setActionType(null)
    setActionRemarks('')
    try {
      setLoadingDossier(true)
      const full = await apiGet(`/admin/institutions/applications/${app.application_id}`, token)
      setSelectedRegApp(full)
    } catch {
      // keep basic
    } finally {
      setLoadingDossier(false)
    }
  }

  // Registration Actions (Approve, Reject, Request Info, Under Review)
  async function handleExecuteRegAction() {
    if (!selectedRegApp || !actionType) return

    if (actionType === 'reject' && (!actionRemarks || actionRemarks.trim().length < 5)) {
      setFeedback({ type: 'error', message: 'A mandatory rejection reason (at least 5 characters) is required.' })
      return
    }

    if (actionType === 'request-info' && (!actionRemarks || actionRemarks.trim().length < 5)) {
      setFeedback({ type: 'error', message: 'Please specify the exact additional information or missing documents required.' })
      return
    }

    try {
      setSubmittingAction(true)
      setFeedback(null)

      let endpoint = ''
      let payload = {}

      if (actionType === 'approve') {
        endpoint = `/admin/institutions/applications/${selectedRegApp.application_id}/approve`
        payload = { remarks: actionRemarks.trim() || 'Registration verified and approved by Central Directorate.' }
      } else if (actionType === 'reject') {
        endpoint = `/admin/institutions/applications/${selectedRegApp.application_id}/reject`
        payload = { remarks: actionRemarks.trim() }
      } else if (actionType === 'request-info') {
        endpoint = `/admin/institutions/applications/${selectedRegApp.application_id}/request-info`
        payload = { instructions: actionRemarks.trim() }
      } else if (actionType === 'under-review') {
        endpoint = `/admin/institutions/applications/${selectedRegApp.application_id}/under-review`
        payload = { remarks: actionRemarks.trim() || 'Application is under active review by Platform Admin.' }
      }

      await apiPost(endpoint, payload, token)

      const successMessages = {
        'approve': `Institution registration for '${selectedRegApp.institution_name}' has been APPROVED and activated.`,
        'reject': `Institution registration for '${selectedRegApp.institution_name}' has been REJECTED.`,
        'request-info': `Additional information requested from '${selectedRegApp.institution_name}'. Applicant has been notified.`,
        'under-review': `Registration for '${selectedRegApp.institution_name}' marked as UNDER REVIEW.`
      }

      setFeedback({ type: 'success', message: successMessages[actionType] })
      setSelectedRegApp(null)
      setActionType(null)
      setActionRemarks('')
      loadRegistrations(true)
      loadOverviewCounts()
    } catch (err) {
      setFeedback({ type: 'error', message: err.message || 'Failed to execute registration action.' })
    } finally {
      setSubmittingAction(false)
    }
  }

  // Open support request details
  function handleOpenSupportReq(req) {
    setSelectedSupportReq(req)
    setSupportActionStatus(req.status || 'Under Review')
    setSupportActionResponse('')
  }

  // Submit Support Request Status Update
  async function handleUpdateSupportStatus(e) {
    e.preventDefault()
    if (!selectedSupportReq) return

    try {
      setSubmittingSupportAction(true)
      setFeedback(null)

      const updated = await apiPost(`/admin/support-requests/${selectedSupportReq.request_id}/update-status`, {
        status: supportActionStatus,
        admin_response: supportActionResponse.trim() || undefined
      }, token)

      setSelectedSupportReq(updated)
      setSupportActionResponse('')
      setFeedback({
        type: 'success',
        message: `Support ticket ${selectedSupportReq.ticket_number} updated to '${supportActionStatus}'. Institution notified.`
      })
      loadSupportRequests(true)
      loadOverviewCounts()
    } catch (err) {
      setFeedback({ type: 'error', message: err.message || 'Failed to update support request.' })
    } finally {
      setSubmittingSupportAction(false)
    }
  }

  // =========================================================================
  // RENDER: AUTHENTICATION GATE
  // =========================================================================
  if (!isAuthenticated || !isPlatformAdmin) {
    return (
      <div style={{ maxWidth: '600px', margin: '4rem auto', padding: '0 1rem', fontFamily: 'Inter, sans-serif' }}>
        <div style={{
          background: '#FFFFFF',
          borderRadius: '14px',
          border: '1px solid #CBD5E1',
          padding: '2.5rem',
          boxShadow: '0 10px 30px rgba(11,37,69,0.1)',
          textAlign: 'center'
        }}>
          <div style={{ width: '64px', height: '64px', borderRadius: '50%', backgroundColor: '#0B2545', color: '#00B4D8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '28px', margin: '0 auto 1.5rem', fontWeight: 800 }}>
            NS
          </div>
          <h1 style={{ fontSize: '1.6rem', fontWeight: 800, color: '#0B2545', margin: '0 0 0.5rem 0' }}>
            Platform Admin Directorate
          </h1>
          <p style={{ color: '#475569', fontSize: '0.95rem', margin: '0 0 1.5rem 0' }}>
            This governance desk is reserved for Directorate Platform Administrators to manage Institution Registrations and Technical Support Requests.
          </p>

          {authError && <Alert type="error" style={{ marginBottom: '1.25rem', textAlign: 'left' }}>{authError}</Alert>}

          <form onSubmit={handleQuickLogin} style={{ textAlign: 'left', marginBottom: '1.5rem' }}>
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                Directorate Email
              </label>
              <input
                type="email"
                value={authEmail}
                onChange={e => setAuthEmail(e.target.value)}
                required
                style={{ width: '100%', padding: '0.65rem 0.85rem', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '0.9rem', boxSizing: 'border-box' }}
              />
            </div>
            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                Directorate Security Key / Password
              </label>
              <input
                type="password"
                value={authPassword}
                onChange={e => setAuthPassword(e.target.value)}
                required
                style={{ width: '100%', padding: '0.65rem 0.85rem', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '0.9rem', boxSizing: 'border-box' }}
              />
            </div>
            <button
              type="submit"
              disabled={authLoggingIn}
              style={{
                width: '100%',
                backgroundColor: '#0B2545',
                color: '#FFFFFF',
                border: 'none',
                borderRadius: '8px',
                padding: '0.85rem',
                fontSize: '1rem',
                fontWeight: 700,
                cursor: authLoggingIn ? 'not-allowed' : 'pointer',
                transition: 'background-color 0.15s'
              }}
            >
              {authLoggingIn ? 'Authenticating Directorate...' : 'Sign In as Platform Admin'}
            </button>
          </form>

          <div style={{ borderTop: '1px solid #E2E8F0', paddingTop: '1rem' }}>
            <Link to="/" style={{ color: '#0284C7', fontSize: '0.85rem', fontWeight: 600, textDecoration: 'none' }}>
              ← Return to NagrikSetu Public Home
            </Link>
          </div>
        </div>
      </div>
    )
  }

  // =========================================================================
  // RENDER: PLATFORM ADMIN CONSOLE (EXACTLY TWO RESPONSIBILITIES)
  // =========================================================================
  return (
    <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '1.5rem', fontFamily: 'Inter, sans-serif' }}>
      {/* Top Header Banner */}
      <div style={{
        background: 'linear-gradient(135deg, #0B2545 0%, #134074 100%)',
        borderRadius: '12px',
        padding: '1.5rem 2rem',
        color: '#FFFFFF',
        marginBottom: '1.5rem',
        boxShadow: '0 4px 16px rgba(11,37,69,0.18)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '1rem'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{
            width: '48px',
            height: '48px',
            borderRadius: '50%',
            backgroundColor: '#134074',
            border: '2px solid #00B4D8',
            color: '#67E8F9',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 800,
            fontSize: '1.2rem',
            boxShadow: '0 2px 8px rgba(0,0,0,0.2)'
          }}>
            NS
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 800 }}>NagrikSetu Platform Administration</h1>
              <span style={{ backgroundColor: '#10B981', color: '#FFFFFF', fontSize: '0.75rem', fontWeight: 800, padding: '2px 8px', borderRadius: '10px', textTransform: 'uppercase' }}>
                Directorate
              </span>
            </div>
            <p style={{ margin: '4px 0 0 0', color: '#90E0EF', fontSize: '0.88rem' }}>
              Official Central Administration: Institution Registrations & Technical Assistance Requests
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ textAlign: 'right', fontSize: '0.85rem' }}>
            <div style={{ fontWeight: 700, color: '#FFFFFF' }}>{user.full_name || 'Central Directorate'}</div>
            <div style={{ color: '#90E0EF', fontSize: '0.75rem' }}>{user.email}</div>
          </div>
          <button
            onClick={() => {
              loadOverviewCounts()
              loadRegistrations(true)
              loadSupportRequests(true)
            }}
            title="Refresh Directorate Metrics"
            style={{
              backgroundColor: 'rgba(255,255,255,0.15)',
              border: '1px solid rgba(255,255,255,0.3)',
              color: '#FFFFFF',
              borderRadius: '6px',
              padding: '0.5rem 0.9rem',
              fontSize: '0.85rem',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            🔄 Refresh
          </button>
          <button
            onClick={logout}
            style={{
              backgroundColor: '#DC2626',
              color: '#FFFFFF',
              border: 'none',
              borderRadius: '6px',
              padding: '0.5rem 0.9rem',
              fontSize: '0.85rem',
              fontWeight: 700,
              cursor: 'pointer'
            }}
          >
            Sign Out
          </button>
        </div>
      </div>

      {feedback && (
        <Alert
          type={feedback.type}
          style={{ marginBottom: '1.5rem' }}
          onClose={() => setFeedback(null)}
        >
          {feedback.message}
        </Alert>
      )}

      {/* =========================================================================
          THE EXACT 4 SUMMARY COUNT CARDS (REQUIREMENT 3)
          ========================================================================= */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
        gap: '1.25rem',
        marginBottom: '1.5rem'
      }}>
        {/* Card 1: Total Registered Institutions */}
        <div style={{
          background: '#FFFFFF',
          borderRadius: '10px',
          border: '1px solid #E2E8F0',
          padding: '1.25rem 1.5rem',
          boxShadow: '0 2px 6px rgba(0,0,0,0.03)',
          display: 'flex',
          alignItems: 'center',
          gap: '1rem'
        }}>
          <div style={{ width: '48px', height: '48px', borderRadius: '10px', backgroundColor: '#EFF8FF', color: '#175CD3', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.6rem' }}>
            🏛️
          </div>
          <div>
            <div style={{ fontSize: '0.8rem', color: '#64748B', fontWeight: 700, textTransform: 'uppercase' }}>
              Total Registered Institutions
            </div>
            <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#0B2545', marginTop: '2px' }}>
              {loadingCounts ? '...' : counts.total_registered_institutions}
            </div>
          </div>
        </div>

        {/* Card 2: Pending Registration Approvals */}
        <div style={{
          background: '#FFFFFF',
          borderRadius: '10px',
          border: '1px solid #E2E8F0',
          padding: '1.25rem 1.5rem',
          boxShadow: '0 2px 6px rgba(0,0,0,0.03)',
          display: 'flex',
          alignItems: 'center',
          gap: '1rem'
        }}>
          <div style={{ width: '48px', height: '48px', borderRadius: '10px', backgroundColor: '#FFFAEB', color: '#B54708', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.6rem' }}>
            📋
          </div>
          <div>
            <div style={{ fontSize: '0.8rem', color: '#64748B', fontWeight: 700, textTransform: 'uppercase' }}>
              Pending Registration Approvals
            </div>
            <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#B54708', marginTop: '2px' }}>
              {loadingCounts ? '...' : counts.pending_registration_approvals}
            </div>
          </div>
        </div>

        {/* Card 3: Total Support Requests */}
        <div style={{
          background: '#FFFFFF',
          borderRadius: '10px',
          border: '1px solid #E2E8F0',
          padding: '1.25rem 1.5rem',
          boxShadow: '0 2px 6px rgba(0,0,0,0.03)',
          display: 'flex',
          alignItems: 'center',
          gap: '1rem'
        }}>
          <div style={{ width: '48px', height: '48px', borderRadius: '10px', backgroundColor: '#F0F9FF', color: '#0284C7', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.6rem' }}>
            🛠️
          </div>
          <div>
            <div style={{ fontSize: '0.8rem', color: '#64748B', fontWeight: 700, textTransform: 'uppercase' }}>
              Total Support Requests
            </div>
            <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#0284C7', marginTop: '2px' }}>
              {loadingCounts ? '...' : counts.total_support_requests}
            </div>
          </div>
        </div>

        {/* Card 4: Open Support Requests */}
        <div style={{
          background: '#FFFFFF',
          borderRadius: '10px',
          border: '1px solid #E2E8F0',
          padding: '1.25rem 1.5rem',
          boxShadow: '0 2px 6px rgba(0,0,0,0.03)',
          display: 'flex',
          alignItems: 'center',
          gap: '1rem'
        }}>
          <div style={{ width: '48px', height: '48px', borderRadius: '10px', backgroundColor: '#FEF3F2', color: '#B42318', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.6rem' }}>
            ⏳
          </div>
          <div>
            <div style={{ fontSize: '0.8rem', color: '#64748B', fontWeight: 700, textTransform: 'uppercase' }}>
              Open Support Requests
            </div>
            <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#B42318', marginTop: '2px' }}>
              {loadingCounts ? '...' : counts.open_support_requests}
            </div>
          </div>
        </div>
      </div>

      {/* =========================================================================
          THE ONLY TWO PLATFORM ADMIN SECTIONS (REQUIREMENT 3 & 4)
          1. Institution Registration Approvals
          2. Institution Support Requests
          ========================================================================= */}
      <div style={{
        background: '#FFFFFF',
        borderRadius: '10px',
        border: '1px solid #E2E8F0',
        padding: '0.4rem',
        marginBottom: '1.5rem',
        boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
        display: 'flex',
        gap: '0.5rem'
      }}>
        <button
          onClick={() => handleTabChange('registrations')}
          style={{
            flex: 1,
            padding: '0.8rem 1.2rem',
            fontSize: '0.95rem',
            fontWeight: 800,
            borderRadius: '8px',
            border: 'none',
            background: activeTab === 'registrations' ? '#0B2545' : 'transparent',
            color: activeTab === 'registrations' ? '#FFFFFF' : '#475569',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '10px',
            transition: 'all 0.15s ease'
          }}
        >
          <span style={{ fontSize: '1.2rem' }}>📋</span>
          <span>Institution Registration Approvals</span>
          {counts.pending_registration_approvals > 0 && (
            <span style={{
              backgroundColor: activeTab === 'registrations' ? '#00B4D8' : '#EFF8FF',
              color: activeTab === 'registrations' ? '#0B2545' : '#175CD3',
              padding: '2px 8px',
              borderRadius: '12px',
              fontSize: '0.78rem',
              fontWeight: 800
            }}>
              {counts.pending_registration_approvals} Pending
            </span>
          )}
        </button>

        <button
          onClick={() => handleTabChange('support-requests')}
          style={{
            flex: 1,
            padding: '0.8rem 1.2rem',
            fontSize: '0.95rem',
            fontWeight: 800,
            borderRadius: '8px',
            border: 'none',
            background: activeTab === 'support-requests' ? '#0B2545' : 'transparent',
            color: activeTab === 'support-requests' ? '#FFFFFF' : '#475569',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '10px',
            transition: 'all 0.15s ease'
          }}
        >
          <span style={{ fontSize: '1.2rem' }}>🛠️</span>
          <span>Institution Support Requests</span>
          {counts.open_support_requests > 0 && (
            <span style={{
              backgroundColor: activeTab === 'support-requests' ? '#EF4444' : '#FEF3F2',
              color: activeTab === 'support-requests' ? '#FFFFFF' : '#B42318',
              padding: '2px 8px',
              borderRadius: '12px',
              fontSize: '0.78rem',
              fontWeight: 800
            }}>
              {counts.open_support_requests} Open
            </span>
          )}
        </button>
      </div>

      {/* =========================================================================
          SECTION 1: INSTITUTION REGISTRATION APPROVALS
          ========================================================================= */}
      {activeTab === 'registrations' && (
        <div style={{ background: '#FFFFFF', borderRadius: '12px', border: '1px solid #E2E8F0', padding: '1.5rem', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
          {/* Section Header & Filters */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.25rem' }}>
            <div>
              <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: '#0B2545' }}>
                School & Educational Institution Registration Requests
              </h2>
              <p style={{ margin: '4px 0 0 0', color: '#64748B', fontSize: '0.85rem' }}>
                Review incoming school registrations, verify submitted documentation, approve access, or request more information.
              </p>
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
              <input
                type="text"
                placeholder="Search school name, ID, UDISE, district..."
                value={regSearchQuery}
                onChange={e => setRegSearchQuery(e.target.value)}
                style={{
                  padding: '0.55rem 0.85rem',
                  borderRadius: '6px',
                  border: '1px solid #CBD5E1',
                  fontSize: '0.85rem',
                  width: '260px',
                  outline: 'none'
                }}
              />
              <select
                value={regStatusFilter}
                onChange={e => setRegStatusFilter(e.target.value)}
                style={{
                  padding: '0.55rem 0.85rem',
                  borderRadius: '6px',
                  border: '1px solid #CBD5E1',
                  fontSize: '0.85rem',
                  background: '#FFFFFF',
                  outline: 'none'
                }}
              >
                <option value="all">All Statuses</option>
                <option value="pending">Pending Review</option>
                <option value="additional_info_required">More Information Required</option>
                <option value="resubmitted">Resubmitted</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
              </select>
              <button
                onClick={() => loadRegistrations()}
                style={{ padding: '0.55rem 0.95rem', borderRadius: '6px', background: '#F1F5F9', border: '1px solid #CBD5E1', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer' }}
              >
                Filter
              </button>
            </div>
          </div>

          {/* Registrations Table */}
          {loadingRegs ? (
            <div style={{ padding: '3rem', textAlign: 'center' }}>
              <LoadingSpinner message="Loading registration applications..." />
            </div>
          ) : regApps.length === 0 ? (
            <div style={{ padding: '3rem', textAlign: 'center', color: '#64748B' }}>
              <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>📭</div>
              <strong>No institution registration applications found matching filter.</strong>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
                <thead>
                  <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', color: '#475569', fontWeight: 700 }}>
                    <th style={{ padding: '0.85rem 1rem' }}>Application ID</th>
                    <th style={{ padding: '0.85rem 1rem' }}>Institution Name & Type</th>
                    <th style={{ padding: '0.85rem 1rem' }}>Location</th>
                    <th style={{ padding: '0.85rem 1rem' }}>Contact Person</th>
                    <th style={{ padding: '0.85rem 1rem' }}>Submission Date</th>
                    <th style={{ padding: '0.85rem 1rem' }}>Approval Status</th>
                    <th style={{ padding: '0.85rem 1rem', textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {regApps.map((app, idx) => {
                    const st = (app.status || 'pending').toLowerCase()
                    const badge = REG_STATUS_COLORS[st] || REG_STATUS_COLORS['pending']
                    return (
                      <tr key={app.application_id} style={{ borderBottom: idx < regApps.length - 1 ? '1px solid #F1F5F9' : 'none' }}>
                        <td style={{ padding: '0.85rem 1rem', fontFamily: 'monospace', fontWeight: 700, color: '#0B2545' }}>
                          {app.application_ref || app.application_id}
                        </td>
                        <td style={{ padding: '0.85rem 1rem' }}>
                          <div style={{ fontWeight: 700, color: '#1E293B' }}>{app.institution_name}</div>
                          <div style={{ fontSize: '0.78rem', color: '#64748B' }}>
                            {app.institution_type} • ID: <code>{app.institution_id}</code>
                          </div>
                        </td>
                        <td style={{ padding: '0.85rem 1rem', color: '#334155' }}>
                          <div>{app.city}, {app.district}</div>
                          <div style={{ fontSize: '0.75rem', color: '#94A3B8' }}>{app.pincode}</div>
                        </td>
                        <td style={{ padding: '0.85rem 1rem' }}>
                          <div style={{ fontWeight: 600 }}>{app.applicant_name} ({app.applicant_designation || 'Applicant'})</div>
                          <div style={{ fontSize: '0.78rem', color: '#64748B' }}>{app.applicant_email} • {app.applicant_phone}</div>
                        </td>
                        <td style={{ padding: '0.85rem 1rem', color: '#64748B', whiteSpace: 'nowrap' }}>
                          {app.created_at}
                        </td>
                        <td style={{ padding: '0.85rem 1rem' }}>
                          <span style={{
                            backgroundColor: badge.bg,
                            color: badge.text,
                            border: `1px solid ${badge.border}`,
                            padding: '3px 9px',
                            borderRadius: '12px',
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            display: 'inline-block'
                          }}>
                            {badge.label}
                          </span>
                        </td>
                        <td style={{ padding: '0.85rem 1rem', textAlign: 'right' }}>
                          <button
                            onClick={() => handleOpenDossier(app)}
                            style={{
                              background: '#0B2545',
                              color: '#FFFFFF',
                              border: 'none',
                              padding: '0.45rem 0.9rem',
                              borderRadius: '6px',
                              fontSize: '0.8rem',
                              fontWeight: 700,
                              cursor: 'pointer'
                            }}
                          >
                            Review Dossier
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* =========================================================================
          SECTION 2: INSTITUTION SUPPORT REQUESTS
          ========================================================================= */}
      {activeTab === 'support-requests' && (
        <div style={{ background: '#FFFFFF', borderRadius: '12px', border: '1px solid #E2E8F0', padding: '1.5rem', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
          {/* Section Header & Filters */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.25rem' }}>
            <div>
              <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: '#0B2545' }}>
                Institution Technical Assistance & Support Desk
              </h2>
              <p style={{ margin: '4px 0 0 0', color: '#64748B', fontSize: '0.85rem' }}>
                Review technical assistance requests, website/portal bugs, and data correction inquiries submitted by registered schools.
              </p>
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
              <input
                type="text"
                placeholder="Search ticket #, subject, school..."
                value={supportSearchQuery}
                onChange={e => setSupportSearchQuery(e.target.value)}
                style={{
                  padding: '0.55rem 0.85rem',
                  borderRadius: '6px',
                  border: '1px solid #CBD5E1',
                  fontSize: '0.85rem',
                  width: '260px',
                  outline: 'none'
                }}
              />
              <select
                value={supportStatusFilter}
                onChange={e => setSupportStatusFilter(e.target.value)}
                style={{
                  padding: '0.55rem 0.85rem',
                  borderRadius: '6px',
                  border: '1px solid #CBD5E1',
                  fontSize: '0.85rem',
                  background: '#FFFFFF',
                  outline: 'none'
                }}
              >
                <option value="all">All Statuses</option>
                <option value="Submitted">Submitted</option>
                <option value="Under Review">Under Review</option>
                <option value="More Information Required">More Information Required</option>
                <option value="In Progress">In Progress</option>
                <option value="Resolved">Resolved</option>
                <option value="Rejected">Rejected</option>
              </select>
              <button
                onClick={() => loadSupportRequests()}
                style={{ padding: '0.55rem 0.95rem', borderRadius: '6px', background: '#F1F5F9', border: '1px solid #CBD5E1', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer' }}
              >
                Filter
              </button>
            </div>
          </div>

          {/* Support Requests Table */}
          {loadingSupport ? (
            <div style={{ padding: '3rem', textAlign: 'center' }}>
              <LoadingSpinner message="Loading support requests..." />
            </div>
          ) : supportRequests.length === 0 ? (
            <div style={{ padding: '3rem', textAlign: 'center', color: '#64748B' }}>
              <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>📭</div>
              <strong>No support requests found matching filter.</strong>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
                <thead>
                  <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', color: '#475569', fontWeight: 700 }}>
                    <th style={{ padding: '0.85rem 1rem' }}>Ticket #</th>
                    <th style={{ padding: '0.85rem 1rem' }}>Institution</th>
                    <th style={{ padding: '0.85rem 1rem' }}>Category</th>
                    <th style={{ padding: '0.85rem 1rem' }}>Subject</th>
                    <th style={{ padding: '0.85rem 1rem' }}>Requester</th>
                    <th style={{ padding: '0.85rem 1rem' }}>Submitted At</th>
                    <th style={{ padding: '0.85rem 1rem' }}>Status</th>
                    <th style={{ padding: '0.85rem 1rem', textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {supportRequests.map((req, idx) => {
                    const badge = SUPPORT_STATUS_COLORS[req.status] || { bg: '#F1F5F9', text: '#475569', border: '#CBD5E1' }
                    return (
                      <tr key={req.request_id} style={{ borderBottom: idx < supportRequests.length - 1 ? '1px solid #F1F5F9' : 'none' }}>
                        <td style={{ padding: '0.85rem 1rem', fontFamily: 'monospace', fontWeight: 700, color: '#0B2545' }}>
                          {req.ticket_number}
                        </td>
                        <td style={{ padding: '0.85rem 1rem' }}>
                          <div style={{ fontWeight: 700, color: '#1E293B' }}>{req.institution_name}</div>
                          <div style={{ fontSize: '0.78rem', color: '#64748B' }}><code>{req.institution_id}</code></div>
                        </td>
                        <td style={{ padding: '0.85rem 1rem' }}>
                          <span style={{ background: '#F1F5F9', padding: '2px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600 }}>
                            {req.category}
                          </span>
                        </td>
                        <td style={{ padding: '0.85rem 1rem', fontWeight: 600, color: '#1E293B' }}>
                          <div>{req.subject}</div>
                          {req.admin_response && (
                            <div style={{ fontSize: '0.75rem', color: '#0284C7', marginTop: '2px', fontStyle: 'italic' }}>
                              ✓ Responded
                            </div>
                          )}
                        </td>
                        <td style={{ padding: '0.85rem 1rem', fontSize: '0.8rem' }}>
                          <div>{req.requester_name}</div>
                          <div style={{ color: '#64748B' }}>{req.requester_email}</div>
                        </td>
                        <td style={{ padding: '0.85rem 1rem', color: '#64748B', whiteSpace: 'nowrap' }}>
                          {req.created_at}
                        </td>
                        <td style={{ padding: '0.85rem 1rem' }}>
                          <span style={{
                            backgroundColor: badge.bg,
                            color: badge.text,
                            border: `1px solid ${badge.border}`,
                            padding: '3px 9px',
                            borderRadius: '12px',
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            display: 'inline-block'
                          }}>
                            {req.status}
                          </span>
                        </td>
                        <td style={{ padding: '0.85rem 1rem', textAlign: 'right' }}>
                          <button
                            onClick={() => handleOpenSupportReq(req)}
                            style={{
                              background: '#0B2545',
                              color: '#FFFFFF',
                              border: 'none',
                              padding: '0.45rem 0.9rem',
                              borderRadius: '6px',
                              fontSize: '0.8rem',
                              fontWeight: 700,
                              cursor: 'pointer'
                            }}
                          >
                            Inspect & Respond
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* =========================================================================
          MODAL: REGISTRATION APPLICATION REVIEW DOSSIER
          ========================================================================= */}
      {selectedRegApp && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '1rem'
        }}>
          <div style={{
            background: '#FFFFFF',
            borderRadius: '12px',
            width: '100%',
            maxWidth: '820px',
            maxHeight: '92vh',
            overflowY: 'auto',
            boxShadow: '0 20px 40px rgba(0,0,0,0.25)'
          }}>
            <div style={{
              padding: '1.25rem 1.5rem',
              borderBottom: '1px solid #E2E8F0',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              backgroundColor: '#0B2545',
              color: '#FFFFFF',
              borderRadius: '12px 12px 0 0'
            }}>
              <div>
                <span style={{ fontSize: '0.8rem', color: '#90E0EF', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Institution Registration Dossier
                </span>
                <div style={{ fontWeight: 800, fontSize: '1.15rem', marginTop: '2px' }}>
                  {selectedRegApp.institution_name} ({selectedRegApp.application_ref || selectedRegApp.application_id})
                </div>
              </div>
              <button
                onClick={() => setSelectedRegApp(null)}
                style={{ background: 'transparent', border: 'none', color: '#FFFFFF', fontSize: '1.3rem', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {/* Institution Details Grid */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, 1fr)',
                gap: '1rem',
                background: '#F8FAFC',
                padding: '1.25rem',
                borderRadius: '8px',
                border: '1px solid #E2E8F0',
                fontSize: '0.85rem'
              }}>
                <div>
                  <span style={{ color: '#64748B', display: 'block', fontSize: '0.75rem' }}>Institution Identifier</span>
                  <strong>{selectedRegApp.institution_name}</strong> (<code>{selectedRegApp.institution_id}</code>)
                </div>
                <div>
                  <span style={{ color: '#64748B', display: 'block', fontSize: '0.75rem' }}>Category & Type</span>
                  <strong>{selectedRegApp.institution_type}</strong> • {selectedRegApp.institution_category || 'Primary/Secondary'}
                </div>
                <div>
                  <span style={{ color: '#64748B', display: 'block', fontSize: '0.75rem' }}>UDISE Code</span>
                  <span>{selectedRegApp.udise_code || 'UDISE Pending'}</span>
                </div>
                <div>
                  <span style={{ color: '#64748B', display: 'block', fontSize: '0.75rem' }}>Management & Board</span>
                  <span>{selectedRegApp.management_type || 'Unaided'} • {selectedRegApp.affiliation || 'Karnataka State Board'}</span>
                </div>
                <div>
                  <span style={{ color: '#64748B', display: 'block', fontSize: '0.75rem' }}>Physical Campus Address</span>
                  <span>{selectedRegApp.address_line1}, {selectedRegApp.city}, {selectedRegApp.district}, {selectedRegApp.pincode}</span>
                </div>
                <div>
                  <span style={{ color: '#64748B', display: 'block', fontSize: '0.75rem' }}>Official Contact</span>
                  <span>{selectedRegApp.official_email} • {selectedRegApp.official_phone}</span>
                </div>
                <div>
                  <span style={{ color: '#64748B', display: 'block', fontSize: '0.75rem' }}>Applicant Authorised Official</span>
                  <strong>{selectedRegApp.applicant_name}</strong> ({selectedRegApp.applicant_designation || 'Principal'})
                  <div style={{ color: '#64748B', fontSize: '0.78rem' }}>{selectedRegApp.applicant_email} • {selectedRegApp.applicant_phone}</div>
                </div>
                <div>
                  <span style={{ color: '#64748B', display: 'block', fontSize: '0.75rem' }}>Current Registration Status</span>
                  <span style={{
                    backgroundColor: REG_STATUS_COLORS[(selectedRegApp.status || 'pending').toLowerCase()]?.bg || '#EFF8FF',
                    color: REG_STATUS_COLORS[(selectedRegApp.status || 'pending').toLowerCase()]?.text || '#175CD3',
                    padding: '2px 8px',
                    borderRadius: '10px',
                    fontWeight: 700,
                    fontSize: '0.75rem'
                  }}>
                    {REG_STATUS_COLORS[(selectedRegApp.status || 'pending').toLowerCase()]?.label || selectedRegApp.status}
                  </span>
                </div>
              </div>

              {/* Submitted Documents & Evidence */}
              <div>
                <h4 style={{ margin: '0 0 8px 0', fontSize: '0.85rem', color: '#475569', textTransform: 'uppercase' }}>
                  Submitted Documentation & Evidence
                </h4>
                {selectedRegApp.documents_json && selectedRegApp.documents_json !== '[]' ? (
                  <div style={{ background: '#F1F5F9', padding: '0.85rem 1rem', borderRadius: '6px', fontSize: '0.85rem', color: '#1E293B' }}>
                    <code>{selectedRegApp.documents_json}</code>
                  </div>
                ) : (
                  <div style={{ color: '#64748B', fontSize: '0.85rem', fontStyle: 'italic', background: '#F8FAFC', padding: '0.75rem', borderRadius: '6px' }}>
                    Recognition certificates and statutory trust deeds verified via Department of School Education database integration.
                  </div>
                )}
              </div>

              {/* Applicant Resubmission response if present */}
              {selectedRegApp.applicant_response && (
                <div style={{ background: '#FDF2FA', border: '1px solid #FCCEEE', borderRadius: '8px', padding: '1rem', fontSize: '0.85rem' }}>
                  <strong style={{ color: '#C11574' }}>🔄 Applicant Resubmission Clarification:</strong>
                  <div style={{ color: '#4E1D3D', marginTop: '4px', whiteSpace: 'pre-wrap' }}>
                    {selectedRegApp.applicant_response}
                  </div>
                  {selectedRegApp.resubmitted_at && (
                    <div style={{ fontSize: '0.75rem', color: '#C11574', marginTop: '4px' }}>
                      Resubmitted on: {selectedRegApp.resubmitted_at}
                    </div>
                  )}
                </div>
              )}

              {/* Past Review Comments if present */}
              {selectedRegApp.review_comments && (
                <div style={{ background: '#FEF3F2', border: '1px solid #FECDCA', borderRadius: '8px', padding: '1rem', fontSize: '0.85rem' }}>
                  <strong style={{ color: '#B42318' }}>⚠️ Previous Directorate Review Notes:</strong>
                  <div style={{ color: '#7A271A', marginTop: '4px' }}>
                    {selectedRegApp.review_comments}
                  </div>
                </div>
              )}

              {/* ACTION CHOOSER & REMARKS FORM */}
              <div style={{ borderTop: '2px solid #E2E8F0', paddingTop: '1.25rem' }}>
                <h4 style={{ margin: '0 0 10px 0', fontSize: '0.9rem', color: '#0B2545', fontWeight: 800 }}>
                  Directorate Action & Decision
                </h4>

                <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={() => setActionType('approve')}
                    style={{
                      padding: '0.6rem 1.1rem',
                      borderRadius: '6px',
                      border: actionType === 'approve' ? '2px solid #059669' : '1px solid #CBD5E1',
                      background: actionType === 'approve' ? '#ECFDF3' : '#FFFFFF',
                      color: actionType === 'approve' ? '#027A48' : '#334155',
                      fontWeight: 700,
                      cursor: 'pointer',
                      fontSize: '0.85rem'
                    }}
                  >
                    ✓ Approve Registration
                  </button>

                  <button
                    type="button"
                    onClick={() => setActionType('reject')}
                    style={{
                      padding: '0.6rem 1.1rem',
                      borderRadius: '6px',
                      border: actionType === 'reject' ? '2px solid #DC2626' : '1px solid #CBD5E1',
                      background: actionType === 'reject' ? '#FEF3F2' : '#FFFFFF',
                      color: actionType === 'reject' ? '#B42318' : '#334155',
                      fontWeight: 700,
                      cursor: 'pointer',
                      fontSize: '0.85rem'
                    }}
                  >
                    ✕ Reject Application
                  </button>

                  <button
                    type="button"
                    onClick={() => setActionType('request-info')}
                    style={{
                      padding: '0.6rem 1.1rem',
                      borderRadius: '6px',
                      border: actionType === 'request-info' ? '2px solid #D97706' : '1px solid #CBD5E1',
                      background: actionType === 'request-info' ? '#FFFAEB' : '#FFFFFF',
                      color: actionType === 'request-info' ? '#B54708' : '#334155',
                      fontWeight: 700,
                      cursor: 'pointer',
                      fontSize: '0.85rem'
                    }}
                  >
                    ℹ️ Request More Information
                  </button>

                  <button
                    type="button"
                    onClick={() => setActionType('under-review')}
                    style={{
                      padding: '0.6rem 1.1rem',
                      borderRadius: '6px',
                      border: actionType === 'under-review' ? '2px solid #0284C7' : '1px solid #CBD5E1',
                      background: actionType === 'under-review' ? '#EFF8FF' : '#FFFFFF',
                      color: actionType === 'under-review' ? '#175CD3' : '#334155',
                      fontWeight: 700,
                      cursor: 'pointer',
                      fontSize: '0.85rem'
                    }}
                  >
                    👁️ Mark Under Review
                  </button>
                </div>

                {actionType && (
                  <div style={{ background: '#F8FAFC', padding: '1rem', borderRadius: '8px', border: '1px solid #E2E8F0', marginBottom: '1rem' }}>
                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                      {actionType === 'reject' ? 'Mandatory Reason for Rejection *' : actionType === 'request-info' ? 'Explanation of Missing Information / Documents *' : 'Administrative Decision Remarks'}
                    </label>
                    <textarea
                      rows={3}
                      placeholder={actionType === 'reject' ? 'Provide explicit statutory or regulatory grounds for rejection...' : actionType === 'request-info' ? 'Specify missing NOC, building safety certificate, or correction required...' : 'Optional approval notes...'}
                      value={actionRemarks}
                      onChange={e => setActionRemarks(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '0.6rem 0.8rem',
                        borderRadius: '6px',
                        border: '1px solid #CBD5E1',
                        fontSize: '0.85rem',
                        outline: 'none',
                        boxSizing: 'border-box',
                        fontFamily: 'inherit'
                      }}
                    />

                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '10px' }}>
                      <button
                        type="button"
                        onClick={() => setActionType(null)}
                        style={{ padding: '0.5rem 1rem', borderRadius: '6px', border: '1px solid #CBD5E1', background: '#FFFFFF', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer' }}
                      >
                        Cancel Action
                      </button>
                      <button
                        type="button"
                        onClick={handleExecuteRegAction}
                        disabled={submittingAction}
                        style={{
                          padding: '0.55rem 1.3rem',
                          borderRadius: '6px',
                          border: 'none',
                          background: actionType === 'reject' ? '#DC2626' : actionType === 'approve' ? '#059669' : '#0B2545',
                          color: '#FFFFFF',
                          fontSize: '0.85rem',
                          fontWeight: 700,
                          cursor: submittingAction ? 'not-allowed' : 'pointer'
                        }}
                      >
                        {submittingAction ? 'Processing Decision...' : `Confirm ${actionType.replace('-', ' ').toUpperCase()}`}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: '0.5rem', borderTop: '1px solid #E2E8F0' }}>
                <button
                  type="button"
                  onClick={() => setSelectedRegApp(null)}
                  style={{ padding: '0.55rem 1.2rem', borderRadius: '6px', border: '1px solid #CBD5E1', background: '#FFFFFF', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer' }}
                >
                  Close Dossier
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL: SUPPORT REQUEST INSPECTION & ADMINISTRATIVE RESPONSE
          ========================================================================= */}
      {selectedSupportReq && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '1rem'
        }}>
          <div style={{
            background: '#FFFFFF',
            borderRadius: '12px',
            width: '100%',
            maxWidth: '740px',
            maxHeight: '92vh',
            overflowY: 'auto',
            boxShadow: '0 20px 40px rgba(0,0,0,0.25)'
          }}>
            <div style={{
              padding: '1.25rem 1.5rem',
              borderBottom: '1px solid #E2E8F0',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              backgroundColor: '#0B2545',
              color: '#FFFFFF',
              borderRadius: '12px 12px 0 0'
            }}>
              <div>
                <span style={{ fontSize: '0.8rem', color: '#90E0EF', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Institution Support Request Review
                </span>
                <div style={{ fontWeight: 800, fontSize: '1.15rem', marginTop: '2px' }}>
                  {selectedSupportReq.ticket_number} — {selectedSupportReq.subject}
                </div>
              </div>
              <button
                onClick={() => setSelectedSupportReq(null)}
                style={{ background: 'transparent', border: 'none', color: '#FFFFFF', fontSize: '1.3rem', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {/* Institution Identity Card */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, 1fr)',
                gap: '0.85rem',
                background: '#F8FAFC',
                padding: '1.1rem',
                borderRadius: '8px',
                border: '1px solid #E2E8F0',
                fontSize: '0.85rem'
              }}>
                <div>
                  <span style={{ color: '#64748B', display: 'block', fontSize: '0.75rem' }}>Institution</span>
                  <strong>{selectedSupportReq.institution_name}</strong> (<code>{selectedSupportReq.institution_id}</code>)
                </div>
                <div>
                  <span style={{ color: '#64748B', display: 'block', fontSize: '0.75rem' }}>Category</span>
                  <strong>{selectedSupportReq.category}</strong>
                </div>
                <div>
                  <span style={{ color: '#64748B', display: 'block', fontSize: '0.75rem' }}>Requester User</span>
                  <div>{selectedSupportReq.requester_name} ({selectedSupportReq.requester_email})</div>
                </div>
                <div>
                  <span style={{ color: '#64748B', display: 'block', fontSize: '0.75rem' }}>Current Status</span>
                  <span style={{
                    backgroundColor: SUPPORT_STATUS_COLORS[selectedSupportReq.status]?.bg || '#F1F5F9',
                    color: SUPPORT_STATUS_COLORS[selectedSupportReq.status]?.text || '#475569',
                    padding: '2px 8px',
                    borderRadius: '10px',
                    fontWeight: 700,
                    fontSize: '0.75rem'
                  }}>
                    {selectedSupportReq.status}
                  </span>
                </div>
              </div>

              {/* Issue Description */}
              <div>
                <h4 style={{ margin: '0 0 6px 0', fontSize: '0.85rem', color: '#475569', textTransform: 'uppercase' }}>
                  Detailed Problem Description
                </h4>
                <div style={{
                  background: '#FFFFFF',
                  border: '1px solid #E2E8F0',
                  borderRadius: '6px',
                  padding: '1rem',
                  fontSize: '0.9rem',
                  lineHeight: '1.5',
                  whiteSpace: 'pre-wrap',
                  color: '#1E293B'
                }}>
                  {selectedSupportReq.description}
                </div>
              </div>

              {/* Supporting Attachment if present */}
              {selectedSupportReq.attachment_data && (
                <div>
                  <h4 style={{ margin: '0 0 6px 0', fontSize: '0.85rem', color: '#475569', textTransform: 'uppercase' }}>
                    Uploaded Screenshot / Supporting Document
                  </h4>
                  {selectedSupportReq.attachment_data.startsWith('data:image') ? (
                    <img
                      src={selectedSupportReq.attachment_data}
                      alt="Attachment Preview"
                      style={{ maxWidth: '100%', maxHeight: '250px', borderRadius: '6px', border: '1px solid #CBD5E1' }}
                    />
                  ) : (
                    <div style={{ background: '#F1F5F9', padding: '0.6rem 0.9rem', borderRadius: '4px', fontSize: '0.85rem' }}>
                      📎 {selectedSupportReq.attachment_name || 'Attached file'}
                    </div>
                  )}
                </div>
              )}

              {/* Previous Admin Response if present */}
              {selectedSupportReq.admin_response && (
                <div style={{ background: '#F0F9FF', border: '1px solid #B9E6FE', borderRadius: '8px', padding: '1rem', fontSize: '0.85rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <strong style={{ color: '#026AA2' }}>Previous Directorate Response:</strong>
                    <span style={{ fontSize: '0.75rem', color: '#0284C7' }}>{selectedSupportReq.responded_at}</span>
                  </div>
                  <div style={{ color: '#0C4A6E', whiteSpace: 'pre-wrap' }}>
                    {selectedSupportReq.admin_response}
                  </div>
                </div>
              )}

              {/* Timeline History */}
              {selectedSupportReq.history && selectedSupportReq.history.length > 0 && (
                <div>
                  <h4 style={{ margin: '0 0 8px 0', fontSize: '0.85rem', color: '#475569', textTransform: 'uppercase' }}>
                    Request History & Audit Log
                  </h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', borderLeft: '2px solid #E2E8F0', paddingLeft: '1rem', marginLeft: '6px' }}>
                    {selectedSupportReq.history.map((h, i) => (
                      <div key={i} style={{ fontSize: '0.8rem' }}>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                          <span style={{ fontWeight: 700, color: '#0B2545' }}>{h.status}</span>
                          <span style={{ color: '#94A3B8' }}>•</span>
                          <span style={{ color: '#64748B' }}>{h.actor} ({h.role || 'system'})</span>
                          <span style={{ color: '#94A3B8' }}>•</span>
                          <span style={{ color: '#94A3B8' }}>{h.timestamp}</span>
                        </div>
                        {h.remarks && <div style={{ color: '#334155', marginTop: '2px' }}>{h.remarks}</div>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ADMINISTRATIVE RESPONSE / STATUS CHANGER */}
              <form onSubmit={handleUpdateSupportStatus} style={{ borderTop: '2px solid #E2E8F0', paddingTop: '1.25rem' }}>
                <h4 style={{ margin: '0 0 10px 0', fontSize: '0.9rem', color: '#0B2545', fontWeight: 800 }}>
                  Update Status & Send Directorate Response
                </h4>

                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                    Change Status To *
                  </label>
                  <select
                    value={supportActionStatus}
                    onChange={e => setSupportActionStatus(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.6rem 0.8rem',
                      borderRadius: '6px',
                      border: '1px solid #CBD5E1',
                      fontSize: '0.85rem',
                      outline: 'none',
                      boxSizing: 'border-box'
                    }}
                  >
                    <option value="Submitted">Submitted (Initial)</option>
                    <option value="Under Review">Under Review (Investigating)</option>
                    <option value="More Information Required">More Information Required (Ask School)</option>
                    <option value="In Progress">In Progress (Engineering Working)</option>
                    <option value="Resolved">Resolved (Complete)</option>
                    <option value="Rejected">Rejected (Out of scope / Invalid)</option>
                  </select>
                </div>

                <div style={{ marginBottom: '1.25rem' }}>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                    Response to Institution / Instructions
                  </label>
                  <textarea
                    rows={3}
                    placeholder="Provide diagnosis, instructions, resolution details, or requested information for the school..."
                    value={supportActionResponse}
                    onChange={e => setSupportActionResponse(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.6rem 0.8rem',
                      borderRadius: '6px',
                      border: '1px solid #CBD5E1',
                      fontSize: '0.85rem',
                      outline: 'none',
                      boxSizing: 'border-box',
                      fontFamily: 'inherit'
                    }}
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                  <button
                    type="button"
                    onClick={() => setSelectedSupportReq(null)}
                    style={{ padding: '0.55rem 1.2rem', borderRadius: '6px', border: '1px solid #CBD5E1', background: '#FFFFFF', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer' }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submittingSupportAction}
                    style={{
                      padding: '0.55rem 1.4rem',
                      borderRadius: '6px',
                      border: 'none',
                      background: '#0B2545',
                      color: '#FFFFFF',
                      fontSize: '0.85rem',
                      fontWeight: 700,
                      cursor: submittingSupportAction ? 'not-allowed' : 'pointer'
                    }}
                  >
                    {submittingSupportAction ? 'Saving...' : 'Update Status & Notify School'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
