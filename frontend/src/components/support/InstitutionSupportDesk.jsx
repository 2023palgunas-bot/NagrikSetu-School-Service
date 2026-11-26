import React, { useState, useEffect, useCallback } from 'react'
import { apiGet, apiPost } from '../../utils/api.js'
import LoadingSpinner from '../ui/LoadingSpinner.jsx'
import Alert from '../ui/Alert.jsx'
import StatusBadge from '../ui/StatusBadge.jsx'

const CATEGORIES = [
  'Website / Portal Not Working',
  'Frontend Errors & Broken Pages',
  'Login & Authentication Issues',
  'Institution Information Correction',
  'Student Records & Enrollment Issue',
  'General Technical Assistance',
  'Other'
]

const STATUS_COLORS = {
  'Submitted': { bg: '#EFF8FF', text: '#175CD3', border: '#B2DDFF' },
  'Under Review': { bg: '#FFFAEB', text: '#B54708', border: '#FEDF89' },
  'More Information Required': { bg: '#FEF3F2', text: '#B42318', border: '#FECDCA' },
  'In Progress': { bg: '#FDF2FA', text: '#C11574', border: '#FCCEEE' },
  'Resolved': { bg: '#ECFDF3', text: '#027A48', border: '#A6F4C5' },
  'Rejected': { bg: '#FEF3F2', text: '#B42318', border: '#FECDCA' }
}

export default function InstitutionSupportDesk({ token, institutionId, institutionName }) {
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [feedback, setFeedback] = useState(null)

  // Filters
  const [statusFilter, setStatusFilter] = useState('all')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')

  // Submit Modal State
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [category, setCategory] = useState(CATEGORIES[0])
  const [subject, setSubject] = useState('')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState('Medium')
  const [attachmentData, setAttachmentData] = useState(null)
  const [attachmentName, setAttachmentName] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Inspect Modal State
  const [selectedReq, setSelectedReq] = useState(null)
  const [replyText, setReplyText] = useState('')
  const [submittingReply, setSubmittingReply] = useState(false)

  const loadRequests = useCallback(async (silent = false) => {
    if (!token) return
    try {
      if (!silent) setLoading(true)
      const params = new URLSearchParams()
      if (institutionId) params.append('institution_id', institutionId)
      if (statusFilter !== 'all') params.append('status', statusFilter)
      if (categoryFilter !== 'all') params.append('category', categoryFilter)
      if (searchQuery.trim()) params.append('search', searchQuery.trim())

      const res = await apiGet(`/institution/support-requests?${params.toString()}`, token)
      setRequests(res.items || [])
    } catch (err) {
      if (!silent) setError(err.message || 'Failed to load support requests.')
    } finally {
      if (!silent) setLoading(false)
    }
  }, [token, institutionId, statusFilter, categoryFilter, searchQuery])

  useEffect(() => {
    loadRequests()
  }, [loadRequests])

  function handleFileChange(e) {
    const file = e.target.files?.[0]
    if (!file) return

    setAttachmentName(file.name)
    const reader = new FileReader()
    reader.onload = () => {
      setAttachmentData(reader.result)
    }
    reader.readAsDataURL(file)
  }

  async function handleCreateSubmit(e) {
    e.preventDefault()
    if (!subject.trim() || !description.trim()) {
      setFeedback({ type: 'error', message: 'Subject and detailed description are required.' })
      return
    }

    try {
      setSubmitting(true)
      setFeedback(null)
      await apiPost('/institution/support-requests', {
        institution_id: institutionId,
        category,
        subject: subject.trim(),
        description: description.trim(),
        priority,
        attachment_data: attachmentData,
        attachment_name: attachmentName
      }, token)

      setFeedback({ type: 'success', message: 'Support request submitted successfully. Platform Admin has been notified.' })
      setShowCreateModal(false)
      setSubject('')
      setDescription('')
      setAttachmentData(null)
      setAttachmentName('')
      loadRequests(true)
    } catch (err) {
      setFeedback({ type: 'error', message: err.message || 'Failed to submit support request.' })
    } finally {
      setSubmitting(false)
    }
  }

  async function handleSendReply(e) {
    e.preventDefault()
    if (!selectedReq || !replyText.trim()) return

    try {
      setSubmittingReply(true)
      const updated = await apiPost(`/institution/support-requests/${selectedReq.request_id}/respond`, {
        response: replyText.trim()
      }, token)

      setSelectedReq(updated)
      setReplyText('')
      setFeedback({ type: 'success', message: 'Response submitted to Platform Admin. Request moved back to Under Review.' })
      loadRequests(true)
    } catch (err) {
      setFeedback({ type: 'error', message: err.message || 'Failed to send response.' })
    } finally {
      setSubmittingReply(false)
    }
  }

  // Summary counts
  const totalCount = requests.length
  const openCount = requests.filter(r => !['Resolved', 'Rejected'].includes(r.status)).length
  const resolvedCount = requests.filter(r => r.status === 'Resolved').length
  const moreInfoCount = requests.filter(r => r.status === 'More Information Required').length

  return (
    <div style={{ padding: '0.5rem 0' }}>
      {/* Header Banner */}
      <div style={{
        background: 'linear-gradient(135deg, #0B2545 0%, #134074 100%)',
        borderRadius: '12px',
        padding: '1.5rem 2rem',
        color: '#FFFFFF',
        marginBottom: '1.5rem',
        boxShadow: '0 4px 12px rgba(11,37,69,0.15)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '1rem'
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            <span style={{ fontSize: '1.4rem' }}>🛠️</span>
            <h2 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 800 }}>Support & Help Requests</h2>
          </div>
          <p style={{ margin: 0, color: '#90E0EF', fontSize: '0.9rem' }}>
            Report website issues, portal errors, student record problems, or request updates for <strong>{institutionName || institutionId}</strong> ({institutionId})
          </p>
        </div>

        <button
          onClick={() => {
            setShowCreateModal(true)
            setFeedback(null)
          }}
          style={{
            backgroundColor: '#00B4D8',
            color: '#0B2545',
            border: 'none',
            borderRadius: '8px',
            padding: '0.75rem 1.4rem',
            fontSize: '0.9rem',
            fontWeight: 800,
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
            transition: 'all 0.15s ease'
          }}
          onMouseOver={e => e.currentTarget.style.backgroundColor = '#90E0EF'}
          onMouseOut={e => e.currentTarget.style.backgroundColor = '#00B4D8'}
        >
          <span>➕</span>
          <span>Submit Support Request</span>
        </button>
      </div>

      {feedback && (
        <Alert
          type={feedback.type}
          style={{ marginBottom: '1.25rem' }}
          onClose={() => setFeedback(null)}
        >
          {feedback.message}
        </Alert>
      )}

      {/* 4 Summary Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '1rem',
        marginBottom: '1.5rem'
      }}>
        <div style={{ background: '#FFFFFF', padding: '1.2rem', borderRadius: '10px', border: '1px solid #E2E8F0', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
          <div style={{ fontSize: '0.8rem', color: '#64748B', fontWeight: 600, textTransform: 'uppercase' }}>Total Requests</div>
          <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#0B2545', marginTop: '4px' }}>{totalCount}</div>
        </div>
        <div style={{ background: '#FFFFFF', padding: '1.2rem', borderRadius: '10px', border: '1px solid #E2E8F0', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
          <div style={{ fontSize: '0.8rem', color: '#64748B', fontWeight: 600, textTransform: 'uppercase' }}>Open / Active</div>
          <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#0284C7', marginTop: '4px' }}>{openCount}</div>
        </div>
        <div style={{ background: '#FFFFFF', padding: '1.2rem', borderRadius: '10px', border: '1px solid #E2E8F0', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
          <div style={{ fontSize: '0.8rem', color: '#64748B', fontWeight: 600, textTransform: 'uppercase' }}>Needs Information</div>
          <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#D97706', marginTop: '4px' }}>{moreInfoCount}</div>
        </div>
        <div style={{ background: '#FFFFFF', padding: '1.2rem', borderRadius: '10px', border: '1px solid #E2E8F0', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
          <div style={{ fontSize: '0.8rem', color: '#64748B', fontWeight: 600, textTransform: 'uppercase' }}>Resolved</div>
          <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#059669', marginTop: '4px' }}>{resolvedCount}</div>
        </div>
      </div>

      {/* Filter Bar */}
      <div style={{
        background: '#FFFFFF',
        padding: '1rem',
        borderRadius: '10px',
        border: '1px solid #E2E8F0',
        marginBottom: '1rem',
        display: 'flex',
        gap: '0.75rem',
        flexWrap: 'wrap',
        alignItems: 'center'
      }}>
        <div style={{ flex: '1 1 200px' }}>
          <input
            type="text"
            placeholder="Search ticket #, subject, or description..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{
              width: '100%',
              padding: '0.55rem 0.85rem',
              borderRadius: '6px',
              border: '1px solid #CBD5E1',
              fontSize: '0.85rem',
              outline: 'none',
              boxSizing: 'border-box'
            }}
          />
        </div>

        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
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

        <select
          value={categoryFilter}
          onChange={e => setCategoryFilter(e.target.value)}
          style={{
            padding: '0.55rem 0.85rem',
            borderRadius: '6px',
            border: '1px solid #CBD5E1',
            fontSize: '0.85rem',
            background: '#FFFFFF',
            outline: 'none'
          }}
        >
          <option value="all">All Categories</option>
          {CATEGORIES.map(c => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>

        <button
          onClick={() => loadRequests()}
          style={{
            padding: '0.55rem 1rem',
            borderRadius: '6px',
            background: '#F1F5F9',
            border: '1px solid #CBD5E1',
            fontSize: '0.85rem',
            fontWeight: 600,
            cursor: 'pointer'
          }}
        >
          🔄 Refresh
        </button>
      </div>

      {/* Requests Table */}
      <div style={{
        background: '#FFFFFF',
        borderRadius: '10px',
        border: '1px solid #E2E8F0',
        overflow: 'hidden',
        boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
      }}>
        {loading ? (
          <div style={{ padding: '3rem', textAlign: 'center' }}>
            <LoadingSpinner message="Loading institution support requests..." />
          </div>
        ) : requests.length === 0 ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: '#64748B' }}>
            <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>📭</div>
            <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#1E293B', marginBottom: '4px' }}>No Support Requests Found</div>
            <p style={{ margin: 0, fontSize: '0.9rem' }}>
              Your institution has not logged any support or assistance requests matching this filter.
            </p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', color: '#475569', fontWeight: 700 }}>
                  <th style={{ padding: '0.85rem 1rem' }}>Ticket #</th>
                  <th style={{ padding: '0.85rem 1rem' }}>Category</th>
                  <th style={{ padding: '0.85rem 1rem' }}>Subject</th>
                  <th style={{ padding: '0.85rem 1rem' }}>Submitted At</th>
                  <th style={{ padding: '0.85rem 1rem' }}>Status</th>
                  <th style={{ padding: '0.85rem 1rem', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {requests.map((req, idx) => {
                  const style = STATUS_COLORS[req.status] || { bg: '#F1F5F9', text: '#475569', border: '#CBD5E1' }
                  return (
                    <tr key={req.request_id} style={{ borderBottom: idx < requests.length - 1 ? '1px solid #F1F5F9' : 'none' }}>
                      <td style={{ padding: '0.85rem 1rem', fontFamily: 'monospace', fontWeight: 700, color: '#0B2545' }}>
                        {req.ticket_number}
                      </td>
                      <td style={{ padding: '0.85rem 1rem', color: '#334155' }}>
                        <span style={{ background: '#F1F5F9', padding: '2px 8px', borderRadius: '4px', fontSize: '0.78rem', fontWeight: 600 }}>
                          {req.category}
                        </span>
                      </td>
                      <td style={{ padding: '0.85rem 1rem', fontWeight: 600, color: '#1E293B' }}>
                        <div>{req.subject}</div>
                        {req.admin_response && (
                          <div style={{ fontSize: '0.75rem', color: '#0284C7', marginTop: '2px', fontStyle: 'italic' }}>
                            💬 Admin response received
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '0.85rem 1rem', color: '#64748B', whiteSpace: 'nowrap' }}>
                        {req.created_at}
                      </td>
                      <td style={{ padding: '0.85rem 1rem' }}>
                        <span style={{
                          backgroundColor: style.bg,
                          color: style.text,
                          border: `1px solid ${style.border}`,
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
                          onClick={() => setSelectedReq(req)}
                          style={{
                            background: '#0B2545',
                            color: '#FFFFFF',
                            border: 'none',
                            padding: '0.4rem 0.85rem',
                            borderRadius: '6px',
                            fontSize: '0.8rem',
                            fontWeight: 600,
                            cursor: 'pointer'
                          }}
                        >
                          View Details
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

      {/* CREATE SUPPORT REQUEST MODAL */}
      {showCreateModal && (
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
            maxWidth: '620px',
            maxHeight: '90vh',
            overflowY: 'auto',
            boxShadow: '0 20px 40px rgba(0,0,0,0.2)'
          }}>
            <div style={{
              padding: '1.2rem 1.5rem',
              borderBottom: '1px solid #E2E8F0',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              backgroundColor: '#0B2545',
              color: '#FFFFFF',
              borderRadius: '12px 12px 0 0'
            }}>
              <div style={{ fontWeight: 800, fontSize: '1.1rem' }}>
                Submit Support & Technical Assistance Request
              </div>
              <button
                onClick={() => setShowCreateModal(false)}
                style={{ background: 'transparent', border: 'none', color: '#FFFFFF', fontSize: '1.2rem', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} style={{ padding: '1.5rem' }}>
              {/* Automatically Identified Institution Banner */}
              <div style={{
                background: '#F0F9FF',
                border: '1px solid #B9E6FE',
                borderRadius: '8px',
                padding: '0.75rem 1rem',
                marginBottom: '1.25rem',
                fontSize: '0.85rem',
                color: '#026AA2'
              }}>
                <strong>Institution Identified:</strong> {institutionName || institutionId} (<code>{institutionId}</code>)
              </div>

              {/* Category */}
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                  Request Category *
                </label>
                <select
                  value={category}
                  onChange={e => setCategory(e.target.value)}
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
                  {CATEGORIES.map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>

              {/* Priority */}
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                  Urgency / Priority
                </label>
                <select
                  value={priority}
                  onChange={e => setPriority(e.target.value)}
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
                  <option value="Low">Low - Informational / Non-urgent</option>
                  <option value="Medium">Medium - Normal operational impact</option>
                  <option value="High">High - Significant feature blocked</option>
                  <option value="Critical">Critical - Portal inaccessible / Outage</option>
                </select>
              </div>

              {/* Subject */}
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                  Subject / Summary *
                </label>
                <input
                  type="text"
                  placeholder="e.g. Cannot update student address in Standard 8-B"
                  value={subject}
                  onChange={e => setSubject(e.target.value)}
                  required
                  style={{
                    width: '100%',
                    padding: '0.6rem 0.8rem',
                    borderRadius: '6px',
                    border: '1px solid #CBD5E1',
                    fontSize: '0.85rem',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              {/* Description */}
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                  Detailed Description *
                </label>
                <textarea
                  rows={4}
                  placeholder="Please describe the problem, steps to reproduce, affected students or pages, and any error message displayed..."
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  required
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

              {/* Attachment */}
              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                  Supporting Screenshot / Attachment (Optional)
                </label>
                <input
                  type="file"
                  accept="image/*,.pdf,.txt"
                  onChange={handleFileChange}
                  style={{ fontSize: '0.85rem', color: '#475569' }}
                />
                {attachmentName && (
                  <div style={{ fontSize: '0.75rem', color: '#059669', marginTop: '4px' }}>
                    ✓ Attached: {attachmentName}
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  style={{
                    padding: '0.6rem 1.2rem',
                    borderRadius: '6px',
                    border: '1px solid #CBD5E1',
                    background: '#FFFFFF',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  style={{
                    padding: '0.6rem 1.4rem',
                    borderRadius: '6px',
                    border: 'none',
                    background: submitting ? '#94A3B8' : '#0B2545',
                    color: '#FFFFFF',
                    fontSize: '0.85rem',
                    fontWeight: 700,
                    cursor: submitting ? 'not-allowed' : 'pointer'
                  }}
                >
                  {submitting ? 'Submitting...' : 'Submit Request'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* INSPECT / VIEW DETAILS MODAL */}
      {selectedReq && (
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
            maxWidth: '680px',
            maxHeight: '90vh',
            overflowY: 'auto',
            boxShadow: '0 20px 40px rgba(0,0,0,0.2)'
          }}>
            <div style={{
              padding: '1.2rem 1.5rem',
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
                  Support Ticket Details
                </span>
                <div style={{ fontWeight: 800, fontSize: '1.1rem', marginTop: '2px' }}>
                  {selectedReq.ticket_number} — {selectedReq.subject}
                </div>
              </div>
              <button
                onClick={() => setSelectedReq(null)}
                style={{ background: 'transparent', border: 'none', color: '#FFFFFF', fontSize: '1.2rem', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
              {/* Meta Grid */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, 1fr)',
                gap: '0.75rem',
                background: '#F8FAFC',
                padding: '1rem',
                borderRadius: '8px',
                border: '1px solid #E2E8F0',
                fontSize: '0.85rem'
              }}>
                <div>
                  <span style={{ color: '#64748B', display: 'block', fontSize: '0.75rem' }}>Institution</span>
                  <strong>{selectedReq.institution_name}</strong> ({selectedReq.institution_id})
                </div>
                <div>
                  <span style={{ color: '#64748B', display: 'block', fontSize: '0.75rem' }}>Category</span>
                  <strong>{selectedReq.category}</strong>
                </div>
                <div>
                  <span style={{ color: '#64748B', display: 'block', fontSize: '0.75rem' }}>Status</span>
                  <span style={{
                    backgroundColor: STATUS_COLORS[selectedReq.status]?.bg || '#F1F5F9',
                    color: STATUS_COLORS[selectedReq.status]?.text || '#475569',
                    padding: '2px 8px',
                    borderRadius: '10px',
                    fontWeight: 700,
                    fontSize: '0.75rem'
                  }}>
                    {selectedReq.status}
                  </span>
                </div>
                <div>
                  <span style={{ color: '#64748B', display: 'block', fontSize: '0.75rem' }}>Submitted At</span>
                  <span>{selectedReq.created_at}</span>
                </div>
              </div>

              {/* Detailed Description */}
              <div>
                <h4 style={{ margin: '0 0 6px 0', fontSize: '0.85rem', color: '#475569', textTransform: 'uppercase' }}>Description</h4>
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
                  {selectedReq.description}
                </div>
              </div>

              {/* Attachment Preview if available */}
              {selectedReq.attachment_data && (
                <div>
                  <h4 style={{ margin: '0 0 6px 0', fontSize: '0.85rem', color: '#475569', textTransform: 'uppercase' }}>Attachment</h4>
                  {selectedReq.attachment_data.startsWith('data:image') ? (
                    <img
                      src={selectedReq.attachment_data}
                      alt="Attachment"
                      style={{ maxWidth: '100%', maxHeight: '250px', borderRadius: '6px', border: '1px solid #CBD5E1' }}
                    />
                  ) : (
                    <div style={{ background: '#F1F5F9', padding: '0.5rem 0.8rem', borderRadius: '4px', fontSize: '0.85rem' }}>
                      📎 {selectedReq.attachment_name || 'Attached file'}
                    </div>
                  )}
                </div>
              )}

              {/* Platform Admin Response Card */}
              {selectedReq.admin_response && (
                <div style={{
                  background: '#F0F9FF',
                  border: '1px solid #B9E6FE',
                  borderRadius: '8px',
                  padding: '1rem',
                  fontSize: '0.85rem'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <strong style={{ color: '#026AA2' }}>🛡️ Platform Admin Official Response</strong>
                    {selectedReq.responded_at && (
                      <span style={{ fontSize: '0.75rem', color: '#0284C7' }}>{selectedReq.responded_at}</span>
                    )}
                  </div>
                  <div style={{ color: '#0C4A6E', whiteSpace: 'pre-wrap', lineHeight: '1.5' }}>
                    {selectedReq.admin_response}
                  </div>
                </div>
              )}

              {/* Clarification Box if status is 'More Information Required' */}
              {selectedReq.status === 'More Information Required' && (
                <div style={{
                  background: '#FEF3F2',
                  border: '1px solid #FECDCA',
                  borderRadius: '8px',
                  padding: '1rem'
                }}>
                  <div style={{ fontWeight: 700, color: '#B42318', marginBottom: '4px', fontSize: '0.85rem' }}>
                    ⚠️ Additional Information Requested by Directorate
                  </div>
                  <p style={{ margin: '0 0 10px 0', fontSize: '0.8rem', color: '#7A271A' }}>
                    Please review the administrator's notes above and submit the requested details below to resume review.
                  </p>
                  <form onSubmit={handleSendReply}>
                    <textarea
                      rows={3}
                      placeholder="Type your response or clarification here..."
                      value={replyText}
                      onChange={e => setReplyText(e.target.value)}
                      required
                      style={{
                        width: '100%',
                        padding: '0.6rem 0.8rem',
                        borderRadius: '6px',
                        border: '1px solid #FDA29B',
                        fontSize: '0.85rem',
                        outline: 'none',
                        boxSizing: 'border-box',
                        fontFamily: 'inherit',
                        marginBottom: '8px'
                      }}
                    />
                    <button
                      type="submit"
                      disabled={submittingReply}
                      style={{
                        backgroundColor: '#B42318',
                        color: '#FFFFFF',
                        border: 'none',
                        padding: '0.5rem 1rem',
                        borderRadius: '6px',
                        fontSize: '0.8rem',
                        fontWeight: 700,
                        cursor: submittingReply ? 'not-allowed' : 'pointer'
                      }}
                    >
                      {submittingReply ? 'Submitting...' : 'Submit Clarification'}
                    </button>
                  </form>
                </div>
              )}

              {/* History Timeline */}
              {selectedReq.history && selectedReq.history.length > 0 && (
                <div>
                  <h4 style={{ margin: '0 0 8px 0', fontSize: '0.85rem', color: '#475569', textTransform: 'uppercase' }}>
                    Request History & Timeline
                  </h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', borderLeft: '2px solid #E2E8F0', paddingLeft: '1rem', marginLeft: '6px' }}>
                    {selectedReq.history.map((h, i) => (
                      <div key={i} style={{ fontSize: '0.8rem' }}>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                          <span style={{ fontWeight: 700, color: '#0B2545' }}>{h.status}</span>
                          <span style={{ color: '#94A3B8' }}>•</span>
                          <span style={{ color: '#64748B' }}>{h.actor} ({h.role || 'user'})</span>
                          <span style={{ color: '#94A3B8' }}>•</span>
                          <span style={{ color: '#94A3B8' }}>{h.timestamp}</span>
                        </div>
                        {h.remarks && (
                          <div style={{ color: '#334155', marginTop: '2px' }}>{h.remarks}</div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: '0.5rem', borderTop: '1px solid #E2E8F0' }}>
                <button
                  type="button"
                  onClick={() => setSelectedReq(null)}
                  style={{
                    padding: '0.55rem 1.2rem',
                    borderRadius: '6px',
                    border: '1px solid #CBD5E1',
                    background: '#FFFFFF',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
