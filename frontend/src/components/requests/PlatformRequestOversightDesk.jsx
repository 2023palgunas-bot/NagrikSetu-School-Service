import { useState, useEffect, useCallback } from 'react'
import { apiGet, apiPost } from '../../utils/api.js'
import { loadToken } from '../../utils/auth.js'
import LoadingSpinner from '../ui/LoadingSpinner.jsx'
import Alert from '../ui/Alert.jsx'
import StatusBadge from '../ui/StatusBadge.jsx'

export default function PlatformRequestOversightDesk({ token: propToken }) {
  const token = propToken || loadToken()

  // Primary Sub-Tab: 'registrations' (School Registration Requests) or 'service-requests' (Citizen & Institution Service Requests)
  const [activeSubTab, setActiveSubTab] = useState('registrations')

  // Feedback & Global states
  const [feedback, setFeedback] = useState(null)

  // ==========================================
  // SECTION A: SCHOOL REGISTRATION REQUESTS STATE
  // ==========================================
  const [regApps, setRegApps] = useState([])
  const [regStats, setRegStats] = useState({
    pending: 0,
    under_review: 0,
    additional_info_required: 0,
    approved: 0,
    rejected: 0,
    total: 0,
    pending_approval_count: 0
  })
  const [loadingRegs, setLoadingRegs] = useState(true)
  const [regStatusFilter, setRegStatusFilter] = useState('all')
  const [regCategoryFilter, setRegCategoryFilter] = useState('all')
  const [regSearchQuery, setRegSearchQuery] = useState('')

  // Dossier Modal State
  const [selectedAppId, setSelectedAppId] = useState(null)
  const [dossierData, setDossierData] = useState(null)
  const [loadingDossier, setLoadingDossier] = useState(false)
  const [dossierError, setDossierError] = useState('')

  // Approval Action Modals
  const [actionType, setActionType] = useState(null) // 'approve', 'reject', 'request-info', 'under-review'
  const [actionRemarks, setActionRemarks] = useState('')
  const [submittingAction, setSubmittingAction] = useState(false)

  // ==========================================
  // SECTION B: CITIZEN SERVICE REQUESTS STATE
  // ==========================================
  const [oversightData, setOversightData] = useState(null)
  const [loadingOversight, setLoadingOversight] = useState(false)
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [institutionFilter, setInstitutionFilter] = useState('ALL')
  const [searchQuery, setSearchQuery] = useState('')

  // Forward Modal State
  const [selectedForwardReq, setSelectedForwardReq] = useState(null)
  const [targetInstId, setTargetInstId] = useState('')
  const [forwardReason, setForwardReason] = useState('')
  const [submittingForward, setSubmittingForward] = useState(false)

  // ==========================================
  // LOADERS
  // ==========================================

  const loadRegistrations = useCallback(async (silent = false) => {
    if (!token) return
    try {
      if (!silent) setLoadingRegs(true)
      const params = new URLSearchParams()
      if (regStatusFilter !== 'all') params.append('status', regStatusFilter)
      if (regCategoryFilter !== 'all') params.append('category', regCategoryFilter)
      if (regSearchQuery.trim()) params.append('search', regSearchQuery.trim())

      const res = await apiGet(`/admin/institutions/applications?${params.toString()}`, token)
      setRegApps(res.items || [])
      setRegStats(res.stats || {})
    } catch (err) {
      console.error('Failed to load school registrations:', err)
      if (!silent) {
        setFeedback({ type: 'error', message: err.message || 'Failed to load school registration applications.' })
      }
    } finally {
      if (!silent) setLoadingRegs(false)
    }
  }, [token, regStatusFilter, regCategoryFilter, regSearchQuery])

  const loadServiceRequests = useCallback(async (silent = false) => {
    if (!token) return
    try {
      if (!silent) setLoadingOversight(true)
      const data = await apiGet('/admin/requests/oversight', token)
      setOversightData(data)
    } catch (err) {
      console.error('Failed to load oversight data:', err)
      if (!silent) {
        setFeedback({ type: 'error', message: err.message || 'Failed to load platform service requests.' })
      }
    } finally {
      if (!silent) setLoadingOversight(false)
    }
  }, [token])

  useEffect(() => {
    if (token) {
      loadRegistrations()
      loadServiceRequests(true)
    }
  }, [token, loadRegistrations, loadServiceRequests])

  // Open Dossier
  const handleOpenDossier = async (appIdOrRef) => {
    setSelectedAppId(appIdOrRef)
    setLoadingDossier(true)
    setDossierError('')
    try {
      const data = await apiGet(`/admin/institutions/applications/${appIdOrRef}`, token)
      setDossierData(data)
    } catch (err) {
      setDossierError(err.message || 'Failed to retrieve application dossier.')
    } finally {
      setLoadingDossier(false)
    }
  }

  // Handle Review Actions
  const handleExecuteAction = async (e) => {
    e.preventDefault()
    if (!selectedAppId || !actionType) return

    if ((actionType === 'reject' || actionType === 'request-info') && !actionRemarks.trim()) {
      alert(actionType === 'reject' ? 'Mandatory rejection reason required.' : 'Specific instructions required.')
      return
    }

    try {
      setSubmittingAction(true)
      let endpoint = ''
      let payload = {}

      if (actionType === 'approve') {
        endpoint = `/admin/institutions/applications/${selectedAppId}/approve`
        payload = { remarks: actionRemarks.trim() || 'Registration approved and institution activated.' }
      } else if (actionType === 'reject') {
        endpoint = `/admin/institutions/applications/${selectedAppId}/reject`
        payload = { remarks: actionRemarks.trim() }
      } else if (actionType === 'request-info') {
        endpoint = `/admin/institutions/applications/${selectedAppId}/request-info`
        payload = { instructions: actionRemarks.trim() }
      } else if (actionType === 'under-review') {
        endpoint = `/admin/institutions/applications/${selectedAppId}/under-review`
        payload = {}
      }

      const res = await apiPost(endpoint, payload, token)
      setFeedback({ type: 'success', message: res.message || 'Action completed successfully.' })

      // Refresh dossier and list
      setActionType(null)
      setActionRemarks('')
      await handleOpenDossier(selectedAppId)
      await loadRegistrations(true)
    } catch (err) {
      setFeedback({ type: 'error', message: err.message || 'Failed to execute administrative action.' })
    } finally {
      setSubmittingAction(false)
    }
  }

  // Handle Service Request Forward
  const handleForwardSubmit = async (e) => {
    e.preventDefault()
    if (!targetInstId.trim() || !forwardReason.trim()) {
      alert('Target institution ID and forwarding reason are required.')
      return
    }
    try {
      setSubmittingForward(true)
      await apiPost(`/admin/requests/${selectedForwardReq}/forward`, {
        target_institution_id: targetInstId.trim(),
        forward_remarks: forwardReason.trim()
      }, token)
      setSelectedForwardReq(null)
      setTargetInstId('')
      setForwardReason('')
      setFeedback({ type: 'success', message: 'Request successfully forwarded to designated institution.' })
      await loadServiceRequests(true)
    } catch (err) {
      setFeedback({ type: 'error', message: err.message || 'Failed to forward request' })
    } finally {
      setSubmittingForward(false)
    }
  }

  if (!token) {
    return (
      <div style={{ textAlign: 'center', padding: '3rem', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
        <h3 style={{ color: '#0f172a', marginBottom: '0.5rem' }}>Authentication Required</h3>
        <p style={{ color: '#64748b' }}>Please sign in as a Platform Administrator to access Platform Request Oversight.</p>
      </div>
    )
  }

  const kpis = oversightData?.kpis || {}
  const instBreakdown = oversightData?.institution_breakdown || []
  const serviceRequests = oversightData?.requests || []

  const filteredServiceRequests = serviceRequests.filter(r => {
    if (statusFilter !== 'ALL' && r.status !== statusFilter) return false
    if (institutionFilter !== 'ALL' && r.assigned_institution_id !== institutionFilter) return false
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      const matchTrack = r.tracking_number?.toLowerCase().includes(q)
      const matchReq = r.requester_name?.toLowerCase().includes(q)
      const matchSub = r.subject?.toLowerCase().includes(q)
      const matchInst = r.assigned_institution_name?.toLowerCase().includes(q) || r.assigned_institution_id?.toLowerCase().includes(q)
      if (!matchTrack && !matchReq && !matchSub && !matchInst) return false
    }
    return true
  })

  return (
    <div style={{ padding: '0.5rem 0' }}>
      {feedback && (
        <Alert type={feedback.type} className="mb-4" onClose={() => setFeedback(null)}>
          {feedback.message}
        </Alert>
      )}

      {/* TOP DUAL-SUBNAV TABS */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '0.75rem',
        borderBottom: '2px solid #e2e8f0',
        marginBottom: '1.25rem',
        paddingBottom: '0.5rem'
      }}>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            onClick={() => setActiveSubTab('registrations')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.6rem 1.1rem',
              borderRadius: '6px 6px 0 0',
              border: 'none',
              background: activeSubTab === 'registrations' ? '#1e3a8a' : '#f1f5f9',
              color: activeSubTab === 'registrations' ? '#ffffff' : '#334155',
              fontWeight: 700,
              fontSize: '0.9rem',
              cursor: 'pointer',
              transition: 'all 0.15s ease'
            }}
          >
            <span>🏫 School Registration Review Centre</span>
            {regStats.pending_approval_count > 0 && (
              <span style={{
                background: activeSubTab === 'registrations' ? '#ef4444' : '#dc2626',
                color: '#ffffff',
                padding: '0.15rem 0.5rem',
                borderRadius: '9999px',
                fontSize: '0.75rem',
                fontWeight: 800
              }}>
                {regStats.pending_approval_count} Pending
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveSubTab('service-requests')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.6rem 1.1rem',
              borderRadius: '6px 6px 0 0',
              border: 'none',
              background: activeSubTab === 'service-requests' ? '#1e3a8a' : '#f1f5f9',
              color: activeSubTab === 'service-requests' ? '#ffffff' : '#334155',
              fontWeight: 700,
              fontSize: '0.9rem',
              cursor: 'pointer',
              transition: 'all 0.15s ease'
            }}
          >
            <span>📋 Citizen & Institution Service Oversight</span>
            {kpis.open_requests > 0 && (
              <span style={{
                background: activeSubTab === 'service-requests' ? '#3b82f6' : '#cbd5e1',
                color: activeSubTab === 'service-requests' ? '#ffffff' : '#1e293b',
                padding: '0.15rem 0.5rem',
                borderRadius: '9999px',
                fontSize: '0.75rem',
                fontWeight: 800
              }}>
                {kpis.open_requests || kpis.open || 0} Open
              </span>
            )}
          </button>
        </div>

        <button
          onClick={() => {
            if (activeSubTab === 'registrations') loadRegistrations()
            else loadServiceRequests()
          }}
          className="btn btn--secondary btn--sm"
          style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 600 }}
        >
          <span>🔄</span> Refresh Queue
        </button>
      </div>

      {/* ======================================================== */}
      {/* SUB-SECTION 1: SCHOOL REGISTRATION REVIEW CENTRE */}
      {/* ======================================================== */}
      {activeSubTab === 'registrations' && (
        <div>
          {/* Status KPI Summary Cards */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
            gap: '0.75rem',
            marginBottom: '1.25rem'
          }}>
            <div style={{ background: '#fef3c7', border: '1px solid #fde68a', borderRadius: '8px', padding: '0.9rem 1rem' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#92400e', textTransform: 'uppercase' }}>⏳ Pending Review</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#b45309', marginTop: '0.2rem' }}>{regStats.pending || 0}</div>
              <div style={{ fontSize: '0.75rem', color: '#92400e' }}>Awaiting initial review</div>
            </div>

            <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px', padding: '0.9rem 1rem' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#1e40af', textTransform: 'uppercase' }}>🔍 Under Review</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#1d4ed8', marginTop: '0.2rem' }}>{regStats.under_review || 0}</div>
              <div style={{ fontSize: '0.75rem', color: '#1e40af' }}>Assigned to reviewer</div>
            </div>

            <div style={{ background: '#f5f3ff', border: '1px solid #ddd6fe', borderRadius: '8px', padding: '0.9rem 1rem' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#5b21b6', textTransform: 'uppercase' }}>⚠️ Info Required</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#6d28d9', marginTop: '0.2rem' }}>{regStats.additional_info_required || 0}</div>
              <div style={{ fontSize: '0.75rem', color: '#5b21b6' }}>Applicant clarification</div>
            </div>

            <div style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: '8px', padding: '0.9rem 1rem' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#065f46', textTransform: 'uppercase' }}>✅ Approved</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#047857', marginTop: '0.2rem' }}>{regStats.approved || 0}</div>
              <div style={{ fontSize: '0.75rem', color: '#065f46' }}>Activated institutions</div>
            </div>

            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '0.9rem 1rem' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#991b1b', textTransform: 'uppercase' }}>❌ Rejected</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#b91c1c', marginTop: '0.2rem' }}>{regStats.rejected || 0}</div>
              <div style={{ fontSize: '0.75rem', color: '#991b1b' }}>Declined applications</div>
            </div>
          </div>

          {/* Filters & Search Toolbar */}
          <div className="card" style={{ padding: '1rem', background: '#ffffff', border: '1px solid #e2e8f0', marginBottom: '1rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem' }}>
              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '0.2rem' }}>
                  SEARCH APPLICATIONS
                </label>
                <input
                  type="text"
                  placeholder="School Name, Reg ID, District, UDISE..."
                  value={regSearchQuery}
                  onChange={(e) => setRegSearchQuery(e.target.value)}
                  className="input input--sm"
                  style={{ width: '100%' }}
                />
              </div>

              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '0.2rem' }}>
                  REGISTRATION STATUS
                </label>
                <select
                  value={regStatusFilter}
                  onChange={(e) => setRegStatusFilter(e.target.value)}
                  className="select select--sm"
                  style={{ width: '100%' }}
                >
                  <option value="all">All Statuses ({regStats.total || 0})</option>
                  <option value="pending">Pending Review ({regStats.pending || 0})</option>
                  <option value="under_review">Under Review ({regStats.under_review || 0})</option>
                  <option value="additional_info_required">Additional Info Required ({regStats.additional_info_required || 0})</option>
                  <option value="approved">Approved ({regStats.approved || 0})</option>
                  <option value="rejected">Rejected ({regStats.rejected || 0})</option>
                </select>
              </div>

              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '0.2rem' }}>
                  INSTITUTION CATEGORY
                </label>
                <select
                  value={regCategoryFilter}
                  onChange={(e) => setRegCategoryFilter(e.target.value)}
                  className="select select--sm"
                  style={{ width: '100%' }}
                >
                  <option value="all">All Categories</option>
                  <option value="Schools (K-10)">Schools (K-10)</option>
                  <option value="PU Colleges (11-12)">PU Colleges (11-12)</option>
                  <option value="Degree Colleges">Degree Colleges</option>
                  <option value="Universities">Universities</option>
                </select>
              </div>
            </div>
          </div>

          {/* Applications Table */}
          <div className="card" style={{ padding: 0, overflow: 'hidden', border: '1px solid #e2e8f0', background: '#ffffff' }}>
            {loadingRegs ? (
              <div style={{ textAlign: 'center', padding: '3rem' }}>
                <LoadingSpinner />
                <p style={{ marginTop: '0.5rem', color: '#64748b' }}>Loading school registration queue...</p>
              </div>
            ) : regApps.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '3.5rem 1rem' }}>
                <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>📭</div>
                <h4 style={{ color: '#0f172a', margin: '0 0 0.4rem 0' }}>No Registration Requests Found</h4>
                <p style={{ color: '#64748b', fontSize: '0.875rem', margin: 0 }}>
                  No school registration applications match the current filter criteria.
                </p>
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0', color: '#334155' }}>
                      <th style={{ padding: '0.75rem 1rem', fontWeight: 700 }}>Request ID</th>
                      <th style={{ padding: '0.75rem 1rem', fontWeight: 700 }}>School / Institution Name</th>
                      <th style={{ padding: '0.75rem 1rem', fontWeight: 700 }}>Category</th>
                      <th style={{ padding: '0.75rem 1rem', fontWeight: 700 }}>District & State</th>
                      <th style={{ padding: '0.75rem 1rem', fontWeight: 700 }}>Submitted Date</th>
                      <th style={{ padding: '0.75rem 1rem', fontWeight: 700 }}>Status</th>
                      <th style={{ padding: '0.75rem 1rem', fontWeight: 700 }}>Last Updated</th>
                      <th style={{ padding: '0.75rem 1rem', fontWeight: 700, textAlign: 'center' }}>Review Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {regApps.map((app, idx) => {
                      const isPending = app.status === 'pending'
                      const isUnderReview = app.status === 'under_review'
                      const isInfoReq = app.status === 'additional_info_required'
                      const isApproved = app.status === 'approved'

                      let statusBadge = (
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.3rem',
                          padding: '0.2rem 0.6rem',
                          borderRadius: '9999px',
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          background: isPending ? '#fef3c7' : isUnderReview ? '#dbeafe' : isInfoReq ? '#ede9fe' : isApproved ? '#d1fae5' : '#fee2e2',
                          color: isPending ? '#92400e' : isUnderReview ? '#1e40af' : isInfoReq ? '#5b21b6' : isApproved ? '#065f46' : '#991b1b',
                          border: `1px solid ${isPending ? '#fcd34d' : isUnderReview ? '#93c5fd' : isInfoReq ? '#c4b5fd' : isApproved ? '#6ee7b7' : '#fca5a5'}`
                        }}>
                          <span>{isPending ? '⏳' : isUnderReview ? '🔍' : isInfoReq ? '⚠️' : isApproved ? '✅' : '❌'}</span>
                          <span>{app.status ? app.status.toUpperCase().replace(/_/g, ' ') : 'PENDING'}</span>
                        </span>
                      )

                      return (
                        <tr
                          key={app.application_id || app.application_ref}
                          style={{
                            borderBottom: '1px solid #f1f5f9',
                            background: idx % 2 === 0 ? '#ffffff' : '#fcfdfd'
                          }}
                        >
                          <td style={{ padding: '0.75rem 1rem', fontWeight: 700, color: '#1e3a8a', whiteSpace: 'nowrap' }}>
                            {app.application_ref}
                            <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 500 }}>ID: {app.institution_id}</div>
                          </td>
                          <td style={{ padding: '0.75rem 1rem' }}>
                            <div style={{ fontWeight: 700, color: '#0f172a' }}>{app.institution_name}</div>
                            <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                              Type: {app.institution_type} {app.udise_code ? `• UDISE: ${app.udise_code}` : ''}
                            </div>
                          </td>
                          <td style={{ padding: '0.75rem 1rem', color: '#334155' }}>
                            <span style={{ background: '#f1f5f9', padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.78rem' }}>
                              {app.institution_category}
                            </span>
                          </td>
                          <td style={{ padding: '0.75rem 1rem', color: '#334155' }}>
                            <div>{app.district}</div>
                            <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{app.state}</div>
                          </td>
                          <td style={{ padding: '0.75rem 1rem', color: '#64748b', whiteSpace: 'nowrap' }}>
                            {app.created_at ? app.created_at.replace('T', ' ').substring(0, 16) : '—'}
                          </td>
                          <td style={{ padding: '0.75rem 1rem', whiteSpace: 'nowrap' }}>
                            {statusBadge}
                          </td>
                          <td style={{ padding: '0.75rem 1rem', color: '#64748b', whiteSpace: 'nowrap' }}>
                            {app.updated_at ? app.updated_at.replace('T', ' ').substring(0, 16) : '—'}
                          </td>
                          <td style={{ padding: '0.75rem 1rem', textAlign: 'center', whiteSpace: 'nowrap' }}>
                            <button
                              onClick={() => handleOpenDossier(app.application_ref)}
                              className="btn btn--secondary btn--sm"
                              style={{ fontWeight: 600, fontSize: '0.78rem' }}
                            >
                              📂 Open Dossier
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
        </div>
      )}

      {/* ======================================================== */}
      {/* SUB-SECTION 2: CITIZEN & INSTITUTION SERVICE OVERSIGHT */}
      {/* ======================================================== */}
      {activeSubTab === 'service-requests' && (
        <div>
          {/* Top KPIs Banner */}
          <div style={{
            background: '#ffffff',
            padding: '1.25rem 1.5rem',
            borderRadius: '10px',
            border: '1px solid #E2E8F0',
            marginBottom: '1.25rem',
            boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
          }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '1rem' }}>
              <div>
                <span style={{ fontSize: '0.78rem', color: '#64748B', textTransform: 'uppercase', fontWeight: 600 }}>Total Tracked Requests</span>
                <p style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0F172A', margin: '0.2rem 0 0 0' }}>{kpis.total_requests || kpis.total || 0}</p>
              </div>
              <div>
                <span style={{ fontSize: '0.78rem', color: '#DC2626', textTransform: 'uppercase', fontWeight: 600 }}>Escalated To Directorate</span>
                <p style={{ fontSize: '1.5rem', fontWeight: 800, color: '#DC2626', margin: '0.2rem 0 0 0' }}>{kpis.escalated_requests || kpis.escalated || 0}</p>
              </div>
              <div>
                <span style={{ fontSize: '0.78rem', color: '#D97706', textTransform: 'uppercase', fontWeight: 600 }}>Open / Under Review</span>
                <p style={{ fontSize: '1.5rem', fontWeight: 800, color: '#D97706', margin: '0.2rem 0 0 0' }}>{kpis.open_requests || kpis.open || 0}</p>
              </div>
              <div>
                <span style={{ fontSize: '0.78rem', color: '#16A34A', textTransform: 'uppercase', fontWeight: 600 }}>Directly Corrected</span>
                <p style={{ fontSize: '1.5rem', fontWeight: 800, color: '#16A34A', margin: '0.2rem 0 0 0' }}>{kpis.corrected_requests || kpis.corrected || 0}</p>
              </div>
            </div>
          </div>

          {/* Institution Breakdown Table */}
          {instBreakdown.length > 0 && (
            <div className="card" style={{ padding: '1rem', background: '#ffffff', border: '1px solid #e2e8f0', marginBottom: '1.25rem' }}>
              <h4 style={{ margin: '0 0 0.75rem 0', color: '#0F172A', fontSize: '0.95rem' }}>Institution-Level Request Distribution</h4>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.84rem' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', borderBottom: '1px solid #E2E8F0', color: '#475569' }}>
                      <th style={{ padding: '0.5rem 0.75rem' }}>Institution ID</th>
                      <th style={{ padding: '0.5rem 0.75rem' }}>Institution Name</th>
                      <th style={{ padding: '0.5rem 0.75rem', textAlign: 'center' }}>Total Requests</th>
                      <th style={{ padding: '0.5rem 0.75rem', textAlign: 'center' }}>Open</th>
                      <th style={{ padding: '0.5rem 0.75rem', textAlign: 'center' }}>Escalated</th>
                      <th style={{ padding: '0.5rem 0.75rem', textAlign: 'center' }}>Resolved</th>
                    </tr>
                  </thead>
                  <tbody>
                    {instBreakdown.map((inst, idx) => (
                      <tr key={inst.institution_id || idx} style={{ borderBottom: '1px solid #F1F5F9' }}>
                        <td style={{ padding: '0.5rem 0.75rem', fontWeight: 700, color: '#1E3A8A' }}>{inst.institution_id}</td>
                        <td style={{ padding: '0.5rem 0.75rem', color: '#0F172A' }}>{inst.institution_name}</td>
                        <td style={{ padding: '0.5rem 0.75rem', textAlign: 'center', fontWeight: 600 }}>{inst.total}</td>
                        <td style={{ padding: '0.5rem 0.75rem', textAlign: 'center', color: '#D97706', fontWeight: 600 }}>{inst.open}</td>
                        <td style={{ padding: '0.5rem 0.75rem', textAlign: 'center', color: '#DC2626', fontWeight: 700 }}>{inst.escalated}</td>
                        <td style={{ padding: '0.5rem 0.75rem', textAlign: 'center', color: '#16A34A', fontWeight: 600 }}>{inst.resolved}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Filters Bar */}
          <div className="card" style={{ padding: '1rem', background: '#ffffff', border: '1px solid #e2e8f0', marginBottom: '1rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem' }}>
              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '0.2rem' }}>SEARCH</label>
                <input
                  type="text"
                  placeholder="Tracking No, Student, Requester..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="input input--sm"
                  style={{ width: '100%' }}
                />
              </div>

              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '0.2rem' }}>STATUS</label>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="select select--sm"
                  style={{ width: '100%' }}
                >
                  <option value="ALL">All Statuses</option>
                  <option value="SUBMITTED">Submitted</option>
                  <option value="UNDER_REVIEW">Under Review</option>
                  <option value="ACTIONED">Actioned</option>
                  <option value="REJECTED">Rejected</option>
                  <option value="RESOLVED">Resolved</option>
                </select>
              </div>

              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '0.2rem' }}>INSTITUTION</label>
                <select
                  value={institutionFilter}
                  onChange={(e) => setInstitutionFilter(e.target.value)}
                  className="select select--sm"
                  style={{ width: '100%' }}
                >
                  <option value="ALL">All Institutions</option>
                  {instBreakdown.map((i) => (
                    <option key={i.institution_id} value={i.institution_id}>
                      {i.institution_id} — {i.institution_name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Service Requests Table */}
          <div className="card" style={{ padding: 0, overflow: 'hidden', border: '1px solid #e2e8f0', background: '#ffffff' }}>
            {filteredServiceRequests.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '3rem' }}>
                <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>📭</div>
                <h4 style={{ color: '#0F172A', margin: 0 }}>No Service Requests Found</h4>
                <p style={{ color: '#64748B', fontSize: '0.85rem' }}>No requests match the selected filters.</p>
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', borderBottom: '2px solid #E2E8F0', color: '#475569' }}>
                      <th style={{ padding: '0.75rem 1rem' }}>Tracking No</th>
                      <th style={{ padding: '0.75rem 1rem' }}>Subject & Category</th>
                      <th style={{ padding: '0.75rem 1rem' }}>Requester</th>
                      <th style={{ padding: '0.75rem 1rem' }}>Assigned Institution</th>
                      <th style={{ padding: '0.75rem 1rem' }}>Status</th>
                      <th style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>Forward Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredServiceRequests.map((r) => (
                      <tr key={r.request_id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                        <td style={{ padding: '0.75rem 1rem', fontWeight: 700, color: '#1E3A8A' }}>
                          {r.tracking_number}
                          {r.is_escalated === 1 && (
                            <span style={{ marginLeft: '0.4rem', background: '#FEE2E2', color: '#991B1B', padding: '0.15rem 0.4rem', borderRadius: '4px', fontSize: '0.7rem' }}>
                              ESCALATED
                            </span>
                          )}
                        </td>
                        <td style={{ padding: '0.75rem 1rem' }}>
                          <div style={{ fontWeight: 600, color: '#0F172A' }}>{r.title || r.subject}</div>
                          <div style={{ fontSize: '0.75rem', color: '#64748B' }}>{r.category}</div>
                        </td>
                        <td style={{ padding: '0.75rem 1rem' }}>
                          <div>{r.requester_name}</div>
                          <div style={{ fontSize: '0.75rem', color: '#64748B' }}>{r.requester_role}</div>
                        </td>
                        <td style={{ padding: '0.75rem 1rem' }}>
                          <div>{r.assigned_institution_name || r.assigned_institution_id}</div>
                          <div style={{ fontSize: '0.75rem', color: '#64748B' }}>Tier: {r.routing_tier || 'School'}</div>
                        </td>
                        <td style={{ padding: '0.75rem 1rem' }}>
                          <StatusBadge status={r.status} />
                        </td>
                        <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                          <button
                            onClick={() => setSelectedForwardReq(r.request_id)}
                            className="btn btn--secondary btn--sm"
                            style={{ fontSize: '0.75rem', padding: '0.3rem 0.6rem' }}
                          >
                            Forward ↪
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL 1: COMPLETE APPLICATION DOSSIER & APPROVAL SUITE */}
      {/* ======================================================== */}
      {selectedAppId && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(15, 23, 42, 0.65)',
          backdropFilter: 'blur(3px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '1rem'
        }}>
          <div style={{
            background: '#ffffff',
            borderRadius: '12px',
            width: '100%',
            maxWidth: '900px',
            maxHeight: '90vh',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)',
            overflow: 'hidden'
          }}>
            {/* Modal Header */}
            <div style={{
              padding: '1.25rem 1.5rem',
              borderBottom: '1px solid #e2e8f0',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              background: '#f8fafc'
            }}>
              <div>
                <h3 style={{ margin: 0, color: '#0f172a', fontSize: '1.25rem', fontWeight: 800 }}>
                  🏫 School Registration Dossier: {dossierData?.institution_name || selectedAppId}
                </h3>
                <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '0.2rem' }}>
                  Application Ref: <strong>{dossierData?.application_ref}</strong> • Institution ID: <strong>{dossierData?.institution_id}</strong>
                </div>
              </div>
              <button
                onClick={() => { setSelectedAppId(null); setDossierData(null); setActionType(null) }}
                style={{ background: 'transparent', border: 'none', fontSize: '1.5rem', color: '#64748b', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ padding: '1.5rem', overflowY: 'auto', flex: 1 }}>
              {loadingDossier ? (
                <div style={{ textAlign: 'center', padding: '3rem' }}>
                  <LoadingSpinner />
                  <p style={{ marginTop: '0.5rem', color: '#64748b' }}>Fetching complete application dossier...</p>
                </div>
              ) : dossierError ? (
                <Alert type="error">{dossierError}</Alert>
              ) : dossierData ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                  {/* Status Banner */}
                  <div style={{
                    padding: '0.9rem 1.25rem',
                    borderRadius: '8px',
                    background: dossierData.status === 'approved' ? '#ecfdf5' : dossierData.status === 'rejected' ? '#fef2f2' : dossierData.status === 'additional_info_required' ? '#f5f3ff' : '#fef3c7',
                    border: `1px solid ${dossierData.status === 'approved' ? '#a7f3d0' : dossierData.status === 'rejected' ? '#fecaca' : dossierData.status === 'additional_info_required' ? '#ddd6fe' : '#fde68a'}`,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: '0.5rem'
                  }}>
                    <div>
                      <span style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: '#475569' }}>Current Lifecycle Status</span>
                      <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#0f172a', textTransform: 'uppercase' }}>
                        {dossierData.status?.replace(/_/g, ' ')}
                      </div>
                    </div>
                    {dossierData.assigned_to_name && (
                      <div style={{ fontSize: '0.8rem', color: '#475569' }}>
                        Assigned Reviewer: <strong>{dossierData.assigned_to_name}</strong>
                      </div>
                    )}
                    {dossierData.reviewed_at && (
                      <div style={{ fontSize: '0.8rem', color: '#475569' }}>
                        Reviewed At: <strong>{dossierData.reviewed_at}</strong>
                      </div>
                    )}
                  </div>

                  {/* Previous Remarks / Instructions */}
                  {dossierData.review_comments && (
                    <div style={{ background: '#f8fafc', padding: '1rem', borderRadius: '8px', borderLeft: '4px solid #3b82f6' }}>
                      <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#1e3a8a', textTransform: 'uppercase' }}>Directorate Review Remarks</span>
                      <p style={{ margin: '0.25rem 0 0 0', color: '#1e293b', fontSize: '0.9rem' }}>{dossierData.review_comments}</p>
                    </div>
                  )}

                  {/* Resubmission Response if present */}
                  {dossierData.applicant_response && (
                    <div style={{ background: '#ecfdf5', padding: '1rem', borderRadius: '8px', borderLeft: '4px solid #10b981' }}>
                      <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#065f46', textTransform: 'uppercase' }}>Applicant Resubmission Notes ({dossierData.resubmitted_at})</span>
                      <p style={{ margin: '0.25rem 0 0 0', color: '#064e3b', fontSize: '0.9rem' }}>{dossierData.applicant_response}</p>
                    </div>
                  )}

                  {/* Grid 1: Legal Identity & Classification */}
                  <div className="card" style={{ padding: '1rem', border: '1px solid #e2e8f0', background: '#ffffff' }}>
                    <h4 style={{ margin: '0 0 0.75rem 0', color: '#0f172a', fontSize: '0.95rem', borderBottom: '1px solid #f1f5f9', paddingBottom: '0.4rem' }}>
                      🏛️ Institutional Identity & Regulatory Classification
                    </h4>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem', fontSize: '0.85rem' }}>
                      <div><span style={{ color: '#64748b' }}>Institution Category:</span> <strong>{dossierData.institution_category}</strong></div>
                      <div><span style={{ color: '#64748b' }}>Institution Type:</span> <strong>{dossierData.institution_type}</strong></div>
                      <div><span style={{ color: '#64748b' }}>Management Type:</span> <strong>{dossierData.management_type || 'Private Unaided'}</strong></div>
                      <div><span style={{ color: '#64748b' }}>UDISE Code:</span> <strong>{dossierData.udise_code || 'Not Applicable / Pending'}</strong></div>
                      <div><span style={{ color: '#64748b' }}>Established Year:</span> <strong>{dossierData.established_year || '—'}</strong></div>
                      <div><span style={{ color: '#64748b' }}>Affiliation Body:</span> <strong>{dossierData.affiliation || '—'}</strong></div>
                      <div><span style={{ color: '#64748b' }}>Recognition/Govt Order:</span> <strong>{dossierData.recognition || '—'}</strong></div>
                    </div>
                  </div>

                  {/* Grid 2: Location & Address */}
                  <div className="card" style={{ padding: '1rem', border: '1px solid #e2e8f0', background: '#ffffff' }}>
                    <h4 style={{ margin: '0 0 0.75rem 0', color: '#0f172a', fontSize: '0.95rem', borderBottom: '1px solid #f1f5f9', paddingBottom: '0.4rem' }}>
                      📍 Campus Location & Postal Address
                    </h4>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem', fontSize: '0.85rem' }}>
                      <div><span style={{ color: '#64748b' }}>Address Line 1:</span> <strong>{dossierData.address_line1}</strong></div>
                      {dossierData.address_line2 && <div><span style={{ color: '#64748b' }}>Address Line 2:</span> <strong>{dossierData.address_line2}</strong></div>}
                      <div><span style={{ color: '#64748b' }}>City / Taluk:</span> <strong>{dossierData.city}</strong></div>
                      <div><span style={{ color: '#64748b' }}>District:</span> <strong>{dossierData.district}</strong></div>
                      <div><span style={{ color: '#64748b' }}>PIN Code:</span> <strong>{dossierData.pincode}</strong></div>
                      <div><span style={{ color: '#64748b' }}>State / Country:</span> <strong>{dossierData.state}, {dossierData.country}</strong></div>
                    </div>
                  </div>

                  {/* Grid 3: Leadership & Administrative Contact */}
                  <div className="card" style={{ padding: '1rem', border: '1px solid #e2e8f0', background: '#ffffff' }}>
                    <h4 style={{ margin: '0 0 0.75rem 0', color: '#0f172a', fontSize: '0.95rem', borderBottom: '1px solid #f1f5f9', paddingBottom: '0.4rem' }}>
                      👤 Principal / Headmaster & Designated Administrator
                    </h4>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem', fontSize: '0.85rem' }}>
                      <div><span style={{ color: '#64748b' }}>Head of Institution:</span> <strong>{dossierData.principal_name || dossierData.applicant_name}</strong></div>
                      <div><span style={{ color: '#64748b' }}>Designation:</span> <strong>{dossierData.applicant_designation || 'Principal'}</strong></div>
                      <div><span style={{ color: '#64748b' }}>Official Contact Phone:</span> <strong>{dossierData.official_phone}</strong></div>
                      <div><span style={{ color: '#64748b' }}>Official Institutional Email:</span> <strong>{dossierData.official_email}</strong></div>
                      <div><span style={{ color: '#64748b' }}>Administrator Account Email:</span> <strong>{dossierData.applicant_email}</strong></div>
                      <div><span style={{ color: '#64748b' }}>Administrator Mobile:</span> <strong>{dossierData.applicant_phone}</strong></div>
                      {dossierData.website && <div><span style={{ color: '#64748b' }}>Institutional Website:</span> <a href={dossierData.website} target="_blank" rel="noreferrer" style={{ color: '#2563eb' }}>{dossierData.website}</a></div>}
                    </div>
                  </div>

                  {/* Grid 4: Metrics & Supporting Uploads */}
                  <div className="card" style={{ padding: '1rem', border: '1px solid #e2e8f0', background: '#ffffff' }}>
                    <h4 style={{ margin: '0 0 0.75rem 0', color: '#0f172a', fontSize: '0.95rem', borderBottom: '1px solid #f1f5f9', paddingBottom: '0.4rem' }}>
                      📊 Student/Staff Capacity & Supporting Documentation
                    </h4>
                    <div style={{ display: 'flex', gap: '2rem', marginBottom: '1rem', fontSize: '0.9rem' }}>
                      <div>Enrolled Student Strength: <strong>{dossierData.student_strength || 0} Students</strong></div>
                      <div>Teaching & Support Staff: <strong>{dossierData.staff_strength || 0} Staff Members</strong></div>
                    </div>

                    <div style={{ fontSize: '0.85rem' }}>
                      <span style={{ fontWeight: 700, color: '#475569', display: 'block', marginBottom: '0.4rem' }}>Uploaded Documentation Proofs:</span>
                      {dossierData.documents && dossierData.documents.length > 0 ? (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                          {dossierData.documents.map((doc, i) => (
                            <div key={i} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', padding: '0.4rem 0.75rem', borderRadius: '6px', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                              <span>📄</span>
                              <div>
                                <div style={{ fontWeight: 600, color: '#0f172a', fontSize: '0.8rem' }}>{doc.doc_type || 'Document'}</div>
                                <div style={{ fontSize: '0.72rem', color: '#64748b' }}>{doc.file_name}</div>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p style={{ color: '#64748b', fontSize: '0.8rem', margin: 0 }}>No separate document attachments filed with initial submission.</p>
                      )}
                    </div>
                  </div>

                  {/* Audit Trail Timeline */}
                  {dossierData.audit_history && dossierData.audit_history.length > 0 && (
                    <div className="card" style={{ padding: '1rem', border: '1px solid #e2e8f0', background: '#ffffff' }}>
                      <h4 style={{ margin: '0 0 0.75rem 0', color: '#0f172a', fontSize: '0.95rem', borderBottom: '1px solid #f1f5f9', paddingBottom: '0.4rem' }}>
                        🛡️ Immutable Directorate Audit History
                      </h4>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        {dossierData.audit_history.map((evt, idx) => (
                          <div key={idx} style={{ fontSize: '0.8rem', padding: '0.4rem 0.6rem', background: '#f8fafc', borderRadius: '4px', borderLeft: '3px solid #3b82f6' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', color: '#64748b' }}>
                              <span><strong>{evt.actor_name}</strong> ({evt.actor_role})</span>
                              <span>{evt.created_at}</span>
                            </div>
                            <div style={{ fontWeight: 600, color: '#0f172a', marginTop: '0.1rem' }}>{evt.action}</div>
                            {evt.remarks && <div style={{ color: '#475569', marginTop: '0.1rem', fontSize: '0.75rem' }}>Remarks: {evt.remarks}</div>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Action Sub-Form when an action button is clicked */}
                  {actionType && (
                    <div style={{
                      background: actionType === 'approve' ? '#f0fdf4' : actionType === 'reject' ? '#fef2f2' : '#f5f3ff',
                      border: `2px solid ${actionType === 'approve' ? '#86efac' : actionType === 'reject' ? '#fca5a5' : '#c4b5fd'}`,
                      borderRadius: '8px',
                      padding: '1.25rem'
                    }}>
                      <h4 style={{ margin: '0 0 0.5rem 0', color: '#0f172a', fontSize: '1rem' }}>
                        {actionType === 'approve' && '✅ Confirm Approval & Activation of Institution'}
                        {actionType === 'reject' && '❌ Reject Registration Application'}
                        {actionType === 'request-info' && '⚠️ Request Specific Additional Information'}
                        {actionType === 'under-review' && '🔍 Mark Application Under Review'}
                      </h4>

                      <form onSubmit={handleExecuteAction}>
                        {(actionType === 'reject' || actionType === 'request-info' || actionType === 'approve') && (
                          <div style={{ marginBottom: '1rem' }}>
                            <label style={{ fontSize: '0.8rem', fontWeight: 700, color: '#334155', display: 'block', marginBottom: '0.3rem' }}>
                              {actionType === 'reject' && 'MANDATORY REJECTION REASON *'}
                              {actionType === 'request-info' && 'SPECIFIC INSTRUCTIONS / MISSING DOCUMENTS REQUIRED *'}
                              {actionType === 'approve' && 'OFFICIAL APPROVAL REMARKS (OPTIONAL)'}
                            </label>
                            <textarea
                              rows={3}
                              className="textarea"
                              style={{ width: '100%', fontSize: '0.85rem' }}
                              placeholder={
                                actionType === 'reject'
                                  ? 'Detail the exact statutory or verification reasons for rejection...'
                                  : actionType === 'request-info'
                                  ? 'Specify the exact missing documents, clearances, or certificates needed...'
                                  : 'Approval remarks for the official record...'
                              }
                              value={actionRemarks}
                              onChange={(e) => setActionRemarks(e.target.value)}
                              required={actionType === 'reject' || actionType === 'request-info'}
                            />
                          </div>
                        )}

                        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                          <button
                            type="button"
                            onClick={() => { setActionType(null); setActionRemarks('') }}
                            className="btn btn--secondary btn--sm"
                            disabled={submittingAction}
                          >
                            Cancel
                          </button>
                          <button
                            type="submit"
                            disabled={submittingAction}
                            style={{
                              padding: '0.45rem 1.1rem',
                              borderRadius: '6px',
                              border: 'none',
                              color: '#ffffff',
                              fontWeight: 700,
                              fontSize: '0.85rem',
                              cursor: 'pointer',
                              background: actionType === 'approve' ? '#16a34a' : actionType === 'reject' ? '#dc2626' : '#6d28d9'
                            }}
                          >
                            {submittingAction ? 'Processing...' : 'Confirm Action'}
                          </button>
                        </div>
                      </form>
                    </div>
                  )}
                </div>
              ) : null}
            </div>

            {/* Modal Footer (Action Buttons) */}
            <div style={{
              padding: '1rem 1.5rem',
              borderTop: '1px solid #e2e8f0',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              background: '#f8fafc',
              flexWrap: 'wrap',
              gap: '0.75rem'
            }}>
              <button
                onClick={() => { setSelectedAppId(null); setDossierData(null); setActionType(null) }}
                className="btn btn--secondary btn--sm"
              >
                Close Dossier
              </button>

              {dossierData && dossierData.status !== 'approved' && dossierData.status !== 'rejected' && (
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  {dossierData.status !== 'under_review' && (
                    <button
                      onClick={() => { setActionType('under-review'); setActionRemarks('') }}
                      className="btn btn--secondary btn--sm"
                      style={{ fontWeight: 600 }}
                    >
                      🔍 Mark Under Review
                    </button>
                  )}

                  <button
                    onClick={() => { setActionType('request-info'); setActionRemarks('') }}
                    style={{
                      background: '#ede9fe',
                      color: '#5b21b6',
                      border: '1px solid #c4b5fd',
                      padding: '0.4rem 0.8rem',
                      borderRadius: '6px',
                      fontSize: '0.8rem',
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}
                  >
                    ⚠️ Request Info
                  </button>

                  <button
                    onClick={() => { setActionType('reject'); setActionRemarks('') }}
                    style={{
                      background: '#fee2e2',
                      color: '#991b1b',
                      border: '1px solid #fca5a5',
                      padding: '0.4rem 0.8rem',
                      borderRadius: '6px',
                      fontSize: '0.8rem',
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}
                  >
                    ❌ Reject
                  </button>

                  <button
                    onClick={() => { setActionType('approve'); setActionRemarks('Registration verified and approved by Central Directorate.') }}
                    style={{
                      background: '#16a34a',
                      color: '#ffffff',
                      border: 'none',
                      padding: '0.4rem 1rem',
                      borderRadius: '6px',
                      fontSize: '0.8rem',
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}
                  >
                    ✅ Approve & Activate
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL 2: FORWARD SERVICE REQUEST MODAL */}
      {/* ======================================================== */}
      {selectedForwardReq && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '1rem'
        }}>
          <div className="card" style={{ width: '100%', maxWidth: '480px', padding: '1.5rem', background: '#ffffff' }}>
            <h3 style={{ margin: '0 0 0.5rem 0', color: '#102B46' }}>Re-Route / Forward Request</h3>
            <p style={{ color: '#64748B', fontSize: '0.85rem', margin: '0 0 1rem 0' }}>
              Assign Request <strong>{selectedForwardReq}</strong> to an institutional desk.
            </p>
            <form onSubmit={handleForwardSubmit}>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ fontSize: '0.8rem', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '0.25rem' }}>
                  Target Institution ID *
                </label>
                <input
                  type="text"
                  placeholder="e.g. SCH001, PUC002..."
                  value={targetInstId}
                  onChange={(e) => setTargetInstId(e.target.value)}
                  className="input input--sm"
                  style={{ width: '100%' }}
                  required
                />
              </div>

              <div style={{ marginBottom: '1.25rem' }}>
                <label style={{ fontSize: '0.8rem', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '0.25rem' }}>
                  Forwarding Remarks / Instructions *
                </label>
                <textarea
                  rows={3}
                  placeholder="Specify reason for forwarding..."
                  value={forwardReason}
                  onChange={(e) => setForwardReason(e.target.value)}
                  className="textarea"
                  style={{ width: '100%', fontSize: '0.85rem' }}
                  required
                />
              </div>

              <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={() => setSelectedForwardReq(null)}
                  className="btn btn--secondary btn--sm"
                  disabled={submittingForward}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn--primary btn--sm"
                  disabled={submittingForward}
                >
                  {submittingForward ? 'Forwarding...' : 'Confirm Forward'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
