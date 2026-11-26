import React, { useState, useEffect } from 'react'
import { apiGet, apiPost, API_URL } from '../../utils/api.js'
import LoadingSpinner from '../ui/LoadingSpinner.jsx'

export default function AdmissionDeskTab({ schoolId, permissions = {}, effectiveRole = '' }) {
  const [overview, setOverview] = useState(null)
  const [applications, setApplications] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)

  // Filters
  const [statusFilter, setStatusFilter] = useState('all')
  const [levelFilter, setLevelFilter] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')

  // Active Application for Inspection / Review Modal
  const [activeApp, setActiveApp] = useState(null)
  const [history, setHistory] = useState([])
  const [loadingHistory, setLoadingHistory] = useState(false)

  // Sub-navigation view states
  const [activeDeskView, setActiveDeskView] = useState('all_apps') // 'all_apps' | 'paid_seat_allotment' | 'class_assignment'
  const [classAssignmentSubTab, setClassAssignmentSubTab] = useState('pending') // 'pending' | 'completed'
  const [allottingSeatApp, setAllottingSeatApp] = useState(null)
  const [assigningClassApp, setAssigningClassApp] = useState(null)
  const [seatAllotNotes, setSeatAllotNotes] = useState('')
  const [allottingSubmitting, setAllottingSubmitting] = useState(false)

  // Stage 2 Dossier & Document Verification State
  const [stage2Dossier, setStage2Dossier] = useState(null)
  const [uploadedDocs, setUploadedDocs] = useState([])
  const [verifyingDocId, setVerifyingDocId] = useState(null)
  const [docNotesMap, setDocNotesMap] = useState({})
  const [availableSections, setAvailableSections] = useState([])
  const [loadingSections, setLoadingSections] = useState(false)
  const [selectedSectionId, setSelectedSectionId] = useState('')
  const [ocrResultsMap, setOcrResultsMap] = useState({})
  const [analyzingDocId, setAnalyzingDocId] = useState(null)

  // Action Form States inside Modal
  const [actionType, setActionType] = useState('none') // 'none' | 'review' | 'clarify' | 'approve' | 'reject' | 'recommend' | 'complete_stage2' | 'allot_seat' | 'assign_class' | 'confirm_enrolment'
  const [recommendationDecision, setRecommendationDecision] = useState('recommend_approval')
  const [actionNotes, setActionNotes] = useState('')
  const [clarificationMessage, setClarificationMessage] = useState('')
  const [rejectionReason, setRejectionReason] = useState('')
  const [rejectionExplanation, setRejectionExplanation] = useState('')
  const [institutionPhone, setInstitutionPhone] = useState('')
  const [actionSubmitting, setActionSubmitting] = useState(false)
  const [actionError, setActionError] = useState(null)
  const [copiedDeskIdMap, setCopiedDeskIdMap] = useState({})

  const handleCopyDeskId = (idValue, key) => {
    if (!idValue) return
    navigator.clipboard?.writeText(idValue)
    setCopiedDeskIdMap(prev => ({ ...prev, [key]: true }))
    setTimeout(() => {
      setCopiedDeskIdMap(prev => ({ ...prev, [key]: false }))
    }, 2500)
  }

  const loadData = async () => {
    try {
      setLoading(true)
      setError(null)
      const [ovData, appData] = await Promise.all([
        apiGet('/school/admissions/overview'),
        apiGet('/school/admissions/applications')
      ])
      setOverview(ovData)
      setApplications(appData?.applications || (Array.isArray(appData) ? appData : []))
    } catch (err) {
      setError(err.message || 'Unable to load admission applications.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [schoolId])

  // Open Inspection Modal & fetch application history
  const handleInspect = async (app) => {
    setActiveApp(app)
    setActionType('none')
    setActionError(null)
    setActionNotes('')
    setClarificationMessage('')
    setRejectionReason('')
    setRejectionExplanation('')
    setInstitutionPhone('')

    try {
      setLoadingHistory(true)
      const [histData, stage2Data] = await Promise.all([
        apiGet(`/school/admissions/${app.application_id}/history`).catch(() => []),
        apiGet(`/admissions/applications/${app.application_id}/stage2-eligibility`).catch(() => null)
      ])
      setHistory(Array.isArray(histData) ? histData : histData?.history || [])
      setStage2Dossier(stage2Data)
      setUploadedDocs(stage2Data?.uploaded_documents || [])

      // Fetch available sections for Phase 6 enrolment
      try {
        setLoadingSections(true)
        const secs = await apiGet(`/school/admissions/${app.application_id}/available-sections`)
        const secList = Array.isArray(secs) ? secs : []
        setAvailableSections(secList)
        if (secList.length > 0) {
          const avail = secList.find(s => !s.is_full) || secList[0]
          setSelectedSectionId(avail.section_id)
        }
      } catch {
        setAvailableSections([])
      } finally {
        setLoadingSections(false)
      }
    } catch (err) {
      setHistory([])
      setStage2Dossier(null)
      setUploadedDocs([])
      setAvailableSections([])
    } finally {
      setLoadingHistory(false)
    }
  }

  // Verify or Reject a single document
  const handleVerifyDocument = async (docId, newStatus) => {
    if (!activeApp) return
    const notes = (docNotesMap[docId] || '').trim()
    if ((newStatus === 'rejected' || newStatus === 'reupload_requested') && (!notes || notes.length < 3)) {
      alert('Please provide verification notes explaining the issue with this document (minimum 3 characters).')
      return
    }
    setVerifyingDocId(docId)
    setActionError(null)
    try {
      await apiPost(`/school/admissions/${activeApp.application_id}/documents/${docId}/verify`, {
        verification_status: newStatus,
        verification_notes: notes || (newStatus === 'verified' ? 'Document verified and authentic.' : null)
      })
      // Refresh documents
      const docsRes = await apiGet(`/admissions/applications/${activeApp.application_id}/documents`)
      setUploadedDocs(Array.isArray(docsRes) ? docsRes : [])
      setSuccess(`Document updated to ${newStatus}.`)
    } catch (err) {
      setActionError(err.message || 'Failed to update document verification.')
    } finally {
      setVerifyingDocId(null)
    }
  }

  // Run Real IDP / OCR Analysis
  const handleRunOcr = async (docId) => {
    if (!activeApp) return
    try {
      setAnalyzingDocId(docId)
      const res = await apiPost(`/school/admissions/${activeApp.application_id}/documents/${docId}/ocr-analyze`, {})
      setOcrResultsMap(prev => ({ ...prev, [docId]: res }))
      setSuccess(`OCR Intelligence Analysis complete: ${res.ocr_engine} (${res.confidence_percentage}% confidence).`)
    } catch (err) {
      setActionError(err.message || 'OCR extraction failed.')
    } finally {
      setAnalyzingDocId(null)
    }
  }

  // Handle Staff Actions
  const handleExecuteAction = async () => {
    if (!activeApp) return
    setActionSubmitting(true)
    setActionError(null)

    try {
      if (actionType === 'recommend') {
        if (!actionNotes.trim()) {
          throw new Error('Please provide notes or rationale justifying your recommendation.')
        }
        await apiPost(`/school/admissions/${activeApp.application_id}/recommend`, {
          recommendation: recommendationDecision,
          notes: actionNotes.trim()
        })
        setSuccess(`Official recommendation submitted for ${activeApp.application_id}.`)
      } else if (actionType === 'review') {
        await apiPost(`/school/admissions/${activeApp.application_id}/review`, {
          notes: actionNotes.trim() || 'Application taken up for review'
        })
        setSuccess(`Application ${activeApp.application_id} marked as Under Review.`)
      } else if (actionType === 'clarify') {
        if (!clarificationMessage.trim() || clarificationMessage.trim().length < 5) {
          throw new Error('Please enter a clarification message (minimum 5 characters).')
        }
        await apiPost(`/school/admissions/${activeApp.application_id}/request-clarification`, {
          clarification_message: clarificationMessage.trim()
        })
        setSuccess(`Clarification request dispatched to parent for ${activeApp.application_id}.`)
      } else if (actionType === 'approve') {
        await apiPost(`/school/admissions/${activeApp.application_id}/approve`, {
          confirm: true,
          note: actionNotes.trim() || 'Stage 1 eligibility criteria met.'
        })
        setSuccess(`Stage 1 approved for ${activeApp.application_id}. Stage 2 will activate for the applicant.`)
      } else if (actionType === 'reject') {
        if (!rejectionReason.trim() || rejectionReason.trim().length < 5) {
          throw new Error('Please specify an official rejection reason (minimum 5 characters).')
        }
        await apiPost(`/school/admissions/${activeApp.application_id}/reject`, {
          rejection_reason: rejectionReason.trim(),
          rejection_explanation: rejectionExplanation.trim() || null,
          institution_contact_phone: institutionPhone.trim() || null
        })
        setSuccess(`Application ${activeApp.application_id} marked as Rejected with official notice.`)
      } else if (actionType === 'complete_stage2') {
        await apiPost(`/school/admissions/${activeApp.application_id}/stage2-review`, {
          decision: 'detailed_review_completed',
          review_notes: actionNotes.trim() || 'All Stage 2 documents and academic records verified.'
        })
        setSuccess(`Payment QR has been sent to the parent! Stage 2 review completed for ${activeApp.application_id}.`)
      } else if (actionType === 'allot_seat') {
        if (activeApp.payment_status !== 'PAID_DEMO') {
          throw new Error(`Cannot allot seat: Demo fee payment must be completed first (Current payment status: ${activeApp.payment_status || 'PENDING'}). Unpaid applications are not eligible for seat allotment.`)
        }
        const seatRes = await apiPost(`/school/admissions/${activeApp.application_id}/allot-seat`, {
          notes: actionNotes.trim() || 'Paid admission seat allotted and Student ID generated.'
        })
        setSuccess(`🎉 Seat Allotted for ${activeApp.applicant_name}! Generated Student ID: ${seatRes.student_id}.`)
      } else if (actionType === 'assign_class') {
        if (!selectedSectionId) {
          throw new Error('Please select an active section to complete class assignment.')
        }
        const clsRes = await apiPost(`/school/admissions/${activeApp.application_id}/assign-class`, {
          section_id: selectedSectionId,
          standard: activeApp.requested_standard,
          notes: actionNotes.trim() || 'Class and section assigned. Admission completed.'
        })
        setSuccess(`🎉 Class assigned! ${activeApp.applicant_name} enrolled in Class ${clsRes.standard}-${clsRes.section}. Official Student ID: ${clsRes.student_id}.`)
      } else if (actionType === 'confirm_enrolment') {
        if (activeApp.payment_status !== 'PAID_DEMO') {
          throw new Error(`Cannot confirm final enrollment: Demo fee payment must be completed first (Current payment status: ${activeApp.payment_status || 'PENDING'}). The parent must mark the demo fee as paid in the Parent Dashboard.`)
        }
        if (!selectedSectionId) {
          throw new Error('Please select an active section to complete student enrolment.')
        }
        const enrRes = await apiPost(`/school/admissions/${activeApp.application_id}/final-admission-confirm`, {
          section_id: selectedSectionId,
          notes: actionNotes.trim() || 'Final admission confirmed and student enrolled in official ledger.'
        })
        setSuccess(`🎉 Student Enrolled! Permanent Student ID: ${enrRes.permanent_student_id} (Std ${enrRes.standard}-${enrRes.section})`)
      }

      // Close modal & reload data
      setActiveApp(null)
      loadData()
    } catch (err) {
      setActionError(err.message || 'Failed to complete requested action.')
    } finally {
      setActionSubmitting(false)
    }
  }

  const handleOpenAllotModal = (app) => {
    setAllottingSeatApp(app)
    setSeatAllotNotes('')
  }

  const handleConfirmSeatAllotment = async () => {
    if (!allottingSeatApp) return
    setAllottingSubmitting(true)
    try {
      const res = await apiPost(`/school/admissions/${allottingSeatApp.application_id}/allot-seat`, {
        notes: seatAllotNotes.trim() || 'Paid admission seat allotted and Student ID generated.'
      })
      setSuccess(`🎉 Seat Allotted for ${allottingSeatApp.applicant_name}! Generated Student ID: ${res.student_id}.`)
      setAllottingSeatApp(null)
      loadData()
    } catch (err) {
      setError(err.message || 'Failed to allot seat.')
    } finally {
      setAllottingSubmitting(false)
    }
  }

  const handleOpenAssignClassModal = async (app) => {
    setAssigningClassApp(app)
    setSelectedSectionId('')
    setLoadingSections(true)
    try {
      const secs = await apiGet(`/school/admissions/${app.application_id}/available-sections`)
      const list = Array.isArray(secs) ? secs : []
      setAvailableSections(list)
      const avail = list.find(s => !s.is_full) || list[0]
      if (avail) setSelectedSectionId(avail.section_id)
    } catch {
      setAvailableSections([])
    } finally {
      setLoadingSections(false)
    }
  }

  const handleConfirmClassAssignment = async () => {
    if (!assigningClassApp || !selectedSectionId) {
      alert('Please select an active section to confirm class assignment.')
      return
    }
    setAllottingSubmitting(true)
    try {
      const res = await apiPost(`/school/admissions/${assigningClassApp.application_id}/assign-class`, {
        section_id: selectedSectionId,
        standard: assigningClassApp.requested_standard || assigningClassApp.standard,
        notes: 'Class and section assigned. Admission completed.'
      })
      setSuccess(`🎉 Class assigned! ${assigningClassApp.applicant_name || assigningClassApp.student_name} enrolled in Class ${res.standard}-${res.section}. Official Student ID: ${res.student_id}.`)
      setAssigningClassApp(null)
      loadData()
    } catch (err) {
      setError(err.message || 'Failed to assign class.')
    } finally {
      setAllottingSubmitting(false)
    }
  }

  // Filtered applications
  const filteredApps = applications.filter(app => {
    if (statusFilter !== 'all' && app.status !== statusFilter) return false
    if (levelFilter !== 'all' && app.education_level !== levelFilter) return false
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      const matchName = (app.applicant_name || '').toLowerCase().includes(q)
      const matchParent = (app.parent_name || '').toLowerCase().includes(q)
      const matchPhone = (app.parent_phone || '').includes(q)
      const matchId = (app.application_id || '').toLowerCase().includes(q)
      if (!matchName && !matchParent && !matchPhone && !matchId) return false
    }
    return true
  })

  // Status badge styling helper
  const renderStatusBadge = (status, paymentStatus) => {
    let mainBadge
    switch (status) {
      case 'submitted':
        mainBadge = <span style={{ background: '#EFF8FF', color: '#175CD3', border: '1px solid #B2DDFF', padding: '0.2rem 0.6rem', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 700 }}>Submitted</span>
        break
      case 'under_review':
        mainBadge = <span style={{ background: '#F8F9FC', color: '#3E4784', border: '1px solid #D5D9EB', padding: '0.2rem 0.6rem', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 700 }}>Under Review</span>
        break
      case 'action_required':
        mainBadge = <span style={{ background: '#FFFAEB', color: '#B54708', border: '1px solid #FEDF89', padding: '0.2rem 0.6rem', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 700 }}>Action Required</span>
        break
      case 'approved':
        mainBadge = <span style={{ background: '#ECFDF3', color: '#027A48', border: '1px solid #A6F4C5', padding: '0.2rem 0.6rem', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 700 }}>Stage 1 Approved</span>
        break
      case 'detailed_review_completed':
      case 'stage2_approved':
        mainBadge = <span style={{ background: '#ECFEFF', color: '#0E7090', border: '1px solid #A5F3FC', padding: '0.2rem 0.6rem', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 700 }}>Stage 2 Approved</span>
        break
      case 'seat_allotted':
        mainBadge = <span style={{ background: '#EFF8FF', color: '#175CD3', border: '1px solid #B2DDFF', padding: '0.2rem 0.6rem', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 700 }}>🎟️ Seat Allotted</span>
        break
      case 'enrolled':
      case 'admission_completed':
      case 'final_admission_confirmed':
        mainBadge = <span style={{ background: '#FDF4FF', color: '#701A75', border: '1px solid #F5D0FE', padding: '0.2rem 0.6rem', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 700 }}>🎓 Enrolled</span>
        break
      case 'rejected':
        mainBadge = <span style={{ background: '#FEF3F2', color: '#B42318', border: '1px solid #FECDCA', padding: '0.2rem 0.6rem', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 700 }}>Rejected</span>
        break
      default:
        mainBadge = <span style={{ background: '#F2F4F7', color: '#344054', padding: '0.2rem 0.6rem', borderRadius: '12px', fontSize: '0.75rem' }}>{status}</span>
    }

    let payBadge = null
    if (paymentStatus === 'PAID_DEMO') {
      payBadge = <span style={{ background: '#ECFDF3', color: '#027A48', border: '1px solid #A6F4C5', padding: '0.15rem 0.5rem', borderRadius: '10px', fontSize: '0.7rem', fontWeight: 700 }}>💳 PAID_DEMO</span>
    } else if (paymentStatus === 'PENDING' || status === 'detailed_review_completed' || status === 'stage2_approved') {
      payBadge = <span style={{ background: '#FFFAEB', color: '#B54708', border: '1px solid #FEDF89', padding: '0.15rem 0.5rem', borderRadius: '10px', fontSize: '0.7rem', fontWeight: 700 }}>⏳ Fee Pending</span>
    }

    return (
      <div style={{ display: 'inline-flex', flexDirection: 'column', gap: '0.3rem', alignItems: 'flex-start' }}>
        {mainBadge}
        {payBadge}
      </div>
    )
  }

  // Derived Workflow Queues
  const paidSeatQueue = applications.filter(a => a.payment_status === 'PAID_DEMO' && ['detailed_review_completed', 'stage2_approved', 'documents_verified', 'approved'].includes(a.status) && !['seat_allotted', 'enrolled', 'admission_completed', 'final_admission_confirmed'].includes(a.status))
  const pendingClassAssignments = applications.filter(a => a.status === 'seat_allotted' || (a.enrolled_student_id && !a.enrolled_section))
  const completedClassAssignments = applications.filter(a => ['enrolled', 'admission_completed', 'final_admission_confirmed'].includes(a.status) && a.enrolled_section)

  return (
    <div className="admission-desk-tab">
      {/* Alert Notices */}
      {error && (
        <div style={{ background: '#FEF3F2', border: '1px solid #FECDCA', color: '#B42318', padding: '0.75rem 1rem', borderRadius: '8px', marginBottom: '1rem', fontSize: '0.875rem' }}>
          ⚠️ {error}
        </div>
      )}
      {success && (
        <div style={{ background: '#ECFDF3', border: '1px solid #A6F4C5', color: '#027A48', padding: '0.75rem 1rem', borderRadius: '8px', marginBottom: '1rem', fontSize: '0.875rem' }}>
          ✓ {success}
        </div>
      )}

      {/* 3 CORE WORKFLOW DESK VIEWS */}
      <div style={{
        display: 'flex',
        gap: '0.5rem',
        marginBottom: '1.5rem',
        borderBottom: '2px solid #E2E8F0',
        paddingBottom: '0.5rem',
        flexWrap: 'wrap'
      }}>
        <button
          type="button"
          onClick={() => setActiveDeskView('all_apps')}
          style={{
            padding: '0.6rem 1.1rem',
            borderRadius: '6px',
            border: 'none',
            background: activeDeskView === 'all_apps' ? '#155EEF' : '#F1F5F9',
            color: activeDeskView === 'all_apps' ? '#ffffff' : '#475467',
            fontWeight: 700,
            fontSize: '0.875rem',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.4rem'
          }}
        >
          <span>📋 All Applications</span>
          <span style={{
            background: activeDeskView === 'all_apps' ? 'rgba(255,255,255,0.25)' : '#E2E8F0',
            color: activeDeskView === 'all_apps' ? '#ffffff' : '#475467',
            borderRadius: '10px',
            padding: '0.1rem 0.5rem',
            fontSize: '0.75rem'
          }}>
            {applications.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveDeskView('paid_seat_allotment')}
          style={{
            padding: '0.6rem 1.1rem',
            borderRadius: '6px',
            border: 'none',
            background: activeDeskView === 'paid_seat_allotment' ? '#027A48' : '#ECFDF3',
            color: activeDeskView === 'paid_seat_allotment' ? '#ffffff' : '#027A48',
            fontWeight: 700,
            fontSize: '0.875rem',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.45rem'
          }}
        >
          <span>💳 Paid Admissions Awaiting Seat Allotment</span>
          {paidSeatQueue.length > 0 && (
            <span style={{
              background: activeDeskView === 'paid_seat_allotment' ? '#ffffff' : '#12B76A',
              color: activeDeskView === 'paid_seat_allotment' ? '#027A48' : '#ffffff',
              borderRadius: '10px',
              padding: '0.1rem 0.55rem',
              fontSize: '0.75rem',
              fontWeight: 800
            }}>
              {paidSeatQueue.length} Ready
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveDeskView('class_assignment')}
          style={{
            padding: '0.6rem 1.1rem',
            borderRadius: '6px',
            border: 'none',
            background: activeDeskView === 'class_assignment' ? '#701A75' : '#FDF4FF',
            color: activeDeskView === 'class_assignment' ? '#ffffff' : '#701A75',
            fontWeight: 700,
            fontSize: '0.875rem',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.45rem'
          }}
        >
          <span>👨‍🎓 Student ID & Class Assignment</span>
          {pendingClassAssignments.length > 0 && (
            <span style={{
              background: activeDeskView === 'class_assignment' ? '#ffffff' : '#C026D3',
              color: activeDeskView === 'class_assignment' ? '#701A75' : '#ffffff',
              borderRadius: '10px',
              padding: '0.1rem 0.55rem',
              fontSize: '0.75rem',
              fontWeight: 800
            }}>
              {pendingClassAssignments.length} Pending
            </span>
          )}
        </button>
      </div>

      {activeDeskView === 'all_apps' && (
        <>
          {/* KPI Overview Metrics Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
        gap: '1rem',
        marginBottom: '1.5rem'
      }}>
        <div style={{ background: '#ffffff', border: '1px solid #E2E8F0', borderRadius: '10px', padding: '1rem', textAlign: 'center' }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748B', textTransform: 'uppercase' }}>Total Applications</div>
          <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#102B46', marginTop: '0.2rem' }}>
            {overview?.total_applications ?? 0}
          </div>
        </div>

        <div style={{ background: '#EFF8FF', border: '1px solid #B2DDFF', borderRadius: '10px', padding: '1rem', textAlign: 'center' }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#175CD3', textTransform: 'uppercase' }}>Submitted (New)</div>
          <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#175CD3', marginTop: '0.2rem' }}>
            {overview?.submitted_count ?? 0}
          </div>
        </div>

        <div style={{ background: '#F8F9FC', border: '1px solid #D5D9EB', borderRadius: '10px', padding: '1rem', textAlign: 'center' }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#3E4784', textTransform: 'uppercase' }}>Under Review</div>
          <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#3E4784', marginTop: '0.2rem' }}>
            {overview?.under_review_count ?? 0}
          </div>
        </div>

        <div style={{ background: '#FFFAEB', border: '1px solid #FEDF89', borderRadius: '10px', padding: '1rem', textAlign: 'center' }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#B54708', textTransform: 'uppercase' }}>Clarification Pending</div>
          <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#B54708', marginTop: '0.2rem' }}>
            {overview?.action_required_count ?? 0}
          </div>
        </div>

        <div style={{ background: '#ECFDF3', border: '1px solid #A6F4C5', borderRadius: '10px', padding: '1rem', textAlign: 'center' }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#027A48', textTransform: 'uppercase' }}>Stage 1 Approved</div>
          <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#027A48', marginTop: '0.2rem' }}>
            {overview?.approved_count ?? 0}
          </div>
        </div>

        <div style={{ background: '#FEF3F2', border: '1px solid #FECDCA', borderRadius: '10px', padding: '1rem', textAlign: 'center' }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#B42318', textTransform: 'uppercase' }}>Rejected</div>
          <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#B42318', marginTop: '0.2rem' }}>
            {overview?.rejected_count ?? 0}
          </div>
        </div>
      </div>

      {/* Filter & Search Controls */}
      <div style={{
        background: '#ffffff',
        border: '1px solid #E2E8F0',
        borderRadius: '10px',
        padding: '1rem 1.25rem',
        marginBottom: '1.5rem',
        display: 'flex',
        flexWrap: 'wrap',
        gap: '1rem',
        alignItems: 'center',
        justifyContent: 'space-between'
      }}>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <div>
            <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748B', display: 'block', marginBottom: '0.2rem' }}>Status</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              style={{ padding: '0.45rem 0.75rem', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '0.85rem' }}
            >
              <option value="all">All Statuses ({applications.length})</option>
              <option value="submitted">Submitted</option>
              <option value="under_review">Under Review</option>
              <option value="action_required">Action Required</option>
              <option value="approved">Stage 1 Approved</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>

          <div>
            <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748B', display: 'block', marginBottom: '0.2rem' }}>Tier / Level</label>
            <select
              value={levelFilter}
              onChange={(e) => setLevelFilter(e.target.value)}
              style={{ padding: '0.45rem 0.75rem', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '0.85rem' }}
            >
              <option value="all">All Levels</option>
              <option value="school">School</option>
              <option value="higher_secondary">Pre-University (PU)</option>
              <option value="diploma">Diploma / Polytechnic</option>
              <option value="undergraduate">Undergraduate Degree</option>
            </select>
          </div>
        </div>

        <div style={{ minWidth: '260px' }}>
          <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748B', display: 'block', marginBottom: '0.2rem' }}>Search Applicant</label>
          <input
            type="text"
            placeholder="Search name, phone, or App ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ width: '100%', padding: '0.45rem 0.75rem', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '0.85rem' }}
          />
        </div>
      </div>

      {/* Applications Roster Table */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem 1rem' }}>
          <LoadingSpinner />
          <p style={{ marginTop: '0.75rem', color: '#64748B' }}>Loading application roster...</p>
        </div>
      ) : filteredApps.length === 0 ? (
        <div style={{
          background: '#F8FAFC',
          border: '1px dashed #CBD5E1',
          borderRadius: '10px',
          padding: '3rem 1rem',
          textAlign: 'center',
          color: '#64748B'
        }}>
          <span style={{ fontSize: '2rem', display: 'block', marginBottom: '0.5rem' }}>📭</span>
          <p style={{ margin: 0, fontWeight: 600 }}>No admission applications match the selected criteria.</p>
        </div>
      ) : (
        <div style={{
          background: '#ffffff',
          border: '1px solid #E2E8F0',
          borderRadius: '10px',
          overflowX: 'auto',
          boxShadow: '0 2px 6px rgba(0,0,0,0.03)'
        }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem', textAlign: 'left' }}>
            <thead>
              <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', color: '#475569', fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                <th style={{ padding: '0.85rem 1rem' }}>Application ID & Date</th>
                <th style={{ padding: '0.85rem 1rem' }}>Applicant Name</th>
                <th style={{ padding: '0.85rem 1rem' }}>Level & Offering</th>
                <th style={{ padding: '0.85rem 1rem' }}>Parent Contact</th>
                <th style={{ padding: '0.85rem 1rem' }}>Status</th>
                <th style={{ padding: '0.85rem 1rem', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredApps.map((app, idx) => (
                <tr key={app.application_id} style={{ borderBottom: idx < filteredApps.length - 1 ? '1px solid #F1F5F9' : 'none' }}>
                  <td style={{ padding: '0.85rem 1rem' }}>
                    <div style={{ fontWeight: 700, color: '#102B46', fontFamily: 'monospace' }}>{app.application_id}</div>
                    <div style={{ fontSize: '0.75rem', color: '#94A3B8', marginTop: '0.15rem' }}>
                      {app.created_at ? new Date(app.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : 'N/A'}
                    </div>
                  </td>
                  <td style={{ padding: '0.85rem 1rem' }}>
                    <div style={{ fontWeight: 600, color: '#1E293B' }}>{app.applicant_name}</div>
                    <div style={{ fontSize: '0.75rem', color: '#64748B' }}>Address: {app.residential_address?.slice(0, 30)}...</div>
                  </td>
                  <td style={{ padding: '0.85rem 1rem' }}>
                    <span style={{ fontSize: '0.75rem', background: '#F1F5F9', color: '#475569', padding: '0.15rem 0.4rem', borderRadius: '4px', textTransform: 'uppercase', fontWeight: 600 }}>
                      {app.education_level?.replace('_', ' ')}
                    </span>
                    <div style={{ fontSize: '0.8rem', color: '#334155', fontWeight: 600, marginTop: '0.2rem' }}>
                      {app.education_level === 'school' && `Std ${app.requested_standard} (${app.first_language_preference || 'Kannada'})`}
                      {app.education_level === 'higher_secondary' && `PU: ${app.combination_code || app.stream_preference}`}
                      {(app.education_level === 'diploma' || app.education_level === 'undergraduate') && (app.requested_program_id || 'Degree Offering')}
                    </div>
                  </td>
                  <td style={{ padding: '0.85rem 1rem' }}>
                    <div style={{ color: '#1E293B' }}>{app.parent_name}</div>
                    <div style={{ fontSize: '0.78rem', color: '#155EEF', fontWeight: 500 }}>📞 {app.parent_phone}</div>
                  </td>
                  <td style={{ padding: '0.85rem 1rem' }}>
                    {renderStatusBadge(app.status, app.payment_status)}
                  </td>
                  <td style={{ padding: '0.85rem 1rem', textAlign: 'right' }}>
                    <button
                      onClick={() => handleInspect(app)}
                      style={{
                        background: '#155EEF',
                        color: '#ffffff',
                        border: 'none',
                        borderRadius: '6px',
                        padding: '0.4rem 0.85rem',
                        fontSize: '0.8rem',
                        fontWeight: 600,
                        cursor: 'pointer'
                      }}
                    >
                      Manage →
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
        </>
      )}

      {/* 2. PAID SEAT ALLOTMENT VIEW */}
      {activeDeskView === 'paid_seat_allotment' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div style={{
            background: '#F0FDF4',
            border: '1px solid #BBF7D0',
            borderRadius: '10px',
            padding: '1.25rem 1.5rem',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '1rem'
          }}>
            <div>
              <h3 style={{ margin: 0, color: '#166534', fontSize: '1.15rem', fontWeight: 800 }}>
                💳 Verified Paid Admissions Ready for Seat Allotment ({paidSeatQueue.length})
              </h3>
              <p style={{ margin: '0.35rem 0 0 0', color: '#15803D', fontSize: '0.85rem' }}>
                These applicants have successfully passed Stage 2 document verification and completed the required admission fee payment (<code>PAID_DEMO</code>). School Admin can allot seats, which automatically generates official Student IDs and notifies parents.
              </p>
            </div>
            <div style={{ background: '#DCFCE7', padding: '0.5rem 1rem', borderRadius: '8px', border: '1px solid #86EFAC', fontWeight: 700, color: '#166534', fontSize: '0.85rem' }}>
              ✓ Strict Enrolment Sequence Enforced
            </div>
          </div>

          {paidSeatQueue.length === 0 ? (
            <div style={{
              background: '#F8FAFC',
              border: '1px dashed #CBD5E1',
              borderRadius: '10px',
              padding: '3.5rem 1rem',
              textAlign: 'center',
              color: '#64748B'
            }}>
              <span style={{ fontSize: '2.5rem', display: 'block', marginBottom: '0.5rem' }}>🎉</span>
              <p style={{ margin: 0, fontWeight: 700, fontSize: '1rem', color: '#334155' }}>
                All paid applicants have been processed!
              </p>
              <p style={{ margin: '0.4rem 0 0 0', fontSize: '0.85rem' }}>
                There are no pending paid admission applications awaiting seat allotment at this time.
              </p>
            </div>
          ) : (
            <div style={{
              background: '#ffffff',
              border: '1px solid #E2E8F0',
              borderRadius: '10px',
              overflowX: 'auto',
              boxShadow: '0 2px 6px rgba(0,0,0,0.03)'
            }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem', textAlign: 'left' }}>
                <thead>
                  <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', color: '#475569', fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    <th style={{ padding: '0.85rem 1rem' }}>Application ID & Date</th>
                    <th style={{ padding: '0.85rem 1rem' }}>Applicant Name</th>
                    <th style={{ padding: '0.85rem 1rem' }}>Requested Standard</th>
                    <th style={{ padding: '0.85rem 1rem' }}>Parent & Contact</th>
                    <th style={{ padding: '0.85rem 1rem' }}>Payment Status</th>
                    <th style={{ padding: '0.85rem 1rem', textAlign: 'right' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {paidSeatQueue.map((app, idx) => (
                    <tr key={app.application_id} style={{ borderBottom: idx < paidSeatQueue.length - 1 ? '1px solid #F1F5F9' : 'none' }}>
                      <td style={{ padding: '0.85rem 1rem' }}>
                        <div style={{ fontWeight: 700, color: '#102B46', fontFamily: 'monospace' }}>{app.application_id}</div>
                        <div style={{ fontSize: '0.75rem', color: '#94A3B8', marginTop: '0.15rem' }}>
                          {app.created_at ? new Date(app.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : 'N/A'}
                        </div>
                      </td>
                      <td style={{ padding: '0.85rem 1rem' }}>
                        <div style={{ fontWeight: 700, color: '#1E293B' }}>{app.applicant_name}</div>
                        <div style={{ fontSize: '0.75rem', color: '#64748B' }}>Catchment: {app.residential_address?.slice(0, 30)}...</div>
                      </td>
                      <td style={{ padding: '0.85rem 1rem' }}>
                        <span style={{ background: '#EFF8FF', color: '#175CD3', border: '1px solid #B2DDFF', padding: '0.2rem 0.55rem', borderRadius: '4px', fontWeight: 700, fontSize: '0.8rem' }}>
                          Standard {app.requested_standard || 'N/A'}
                        </span>
                        <div style={{ fontSize: '0.75rem', color: '#64748B', marginTop: '0.2rem' }}>
                          Lang: {app.first_language_preference || 'Kannada'}
                        </div>
                      </td>
                      <td style={{ padding: '0.85rem 1rem' }}>
                        <div style={{ fontWeight: 600, color: '#1E293B' }}>{app.parent_name}</div>
                        <div style={{ fontSize: '0.78rem', color: '#155EEF' }}>📞 {app.parent_phone}</div>
                      </td>
                      <td style={{ padding: '0.85rem 1rem' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', alignItems: 'flex-start' }}>
                          <span style={{ background: '#ECFDF3', color: '#027A48', border: '1px solid #A6F4C5', padding: '0.2rem 0.6rem', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 700 }}>
                            ✓ PAID_DEMO (₹{(app.payment_amount || 1200).toFixed(0)})
                          </span>
                          <span style={{ fontSize: '0.72rem', color: '#64748B', fontFamily: 'monospace' }}>
                            Ref: {app.payment_ref || 'VERIFIED'}
                          </span>
                        </div>
                      </td>
                      <td style={{ padding: '0.85rem 1rem', textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', gap: '0.5rem', alignItems: 'center' }}>
                          <button
                            onClick={() => handleInspect(app)}
                            style={{
                              background: '#F1F5F9',
                              color: '#334155',
                              border: '1px solid #CBD5E1',
                              borderRadius: '6px',
                              padding: '0.45rem 0.75rem',
                              fontSize: '0.8rem',
                              fontWeight: 600,
                              cursor: 'pointer'
                            }}
                          >
                            Dossier
                          </button>
                          <button
                            onClick={() => handleOpenAllotModal(app)}
                            style={{
                              background: '#027A48',
                              color: '#ffffff',
                              border: 'none',
                              borderRadius: '6px',
                              padding: '0.45rem 0.95rem',
                              fontSize: '0.8rem',
                              fontWeight: 700,
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.35rem',
                              boxShadow: '0 1px 3px rgba(2,122,72,0.3)'
                            }}
                          >
                            <span>🎟️ Allot Seat & ID</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* 3. STUDENT ID & CLASS ASSIGNMENT VIEW */}
      {activeDeskView === 'class_assignment' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Sub-tab navigation */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', borderBottom: '1px solid #E2E8F0', paddingBottom: '0.75rem' }}>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                type="button"
                onClick={() => setClassAssignmentSubTab('pending')}
                style={{
                  padding: '0.45rem 0.9rem',
                  borderRadius: '6px',
                  border: '1px solid',
                  borderColor: classAssignmentSubTab === 'pending' ? '#701A75' : '#CBD5E1',
                  background: classAssignmentSubTab === 'pending' ? '#FDF4FF' : '#ffffff',
                  color: classAssignmentSubTab === 'pending' ? '#701A75' : '#475467',
                  fontWeight: 700,
                  fontSize: '0.85rem',
                  cursor: 'pointer'
                }}
              >
                ⏳ Pending Class Assignment ({pendingClassAssignments.length})
              </button>
              <button
                type="button"
                onClick={() => setClassAssignmentSubTab('completed')}
                style={{
                  padding: '0.45rem 0.9rem',
                  borderRadius: '6px',
                  border: '1px solid',
                  borderColor: classAssignmentSubTab === 'completed' ? '#027A48' : '#CBD5E1',
                  background: classAssignmentSubTab === 'completed' ? '#ECFDF3' : '#ffffff',
                  color: classAssignmentSubTab === 'completed' ? '#027A48' : '#475467',
                  fontWeight: 700,
                  fontSize: '0.85rem',
                  cursor: 'pointer'
                }}
              >
                ✓ Active Enrolments & Assigned Classes ({completedClassAssignments.length})
              </button>
            </div>
            <div style={{ fontSize: '0.8rem', color: '#64748B' }}>
              Allocates students to sections, connects to attendance registers, and enforces standard consistency.
            </div>
          </div>

          {classAssignmentSubTab === 'pending' ? (
            pendingClassAssignments.length === 0 ? (
              <div style={{ background: '#F8FAFC', border: '1px dashed #CBD5E1', borderRadius: '10px', padding: '3.5rem 1rem', textAlign: 'center', color: '#64748B' }}>
                <span style={{ fontSize: '2.5rem', display: 'block', marginBottom: '0.5rem' }}>🏫</span>
                <p style={{ margin: 0, fontWeight: 700, fontSize: '1rem', color: '#334155' }}>
                  No students pending section assignment!
                </p>
                <p style={{ margin: '0.4rem 0 0 0', fontSize: '0.85rem' }}>
                  All students with allotted seats have been assigned to their classes and sections.
                </p>
              </div>
            ) : (
              <div style={{ background: '#ffffff', border: '1px solid #E2E8F0', borderRadius: '10px', overflowX: 'auto', boxShadow: '0 2px 6px rgba(0,0,0,0.03)' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', color: '#475569', fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      <th style={{ padding: '0.85rem 1rem' }}>Generated Student ID</th>
                      <th style={{ padding: '0.85rem 1rem' }}>Applicant / Student</th>
                      <th style={{ padding: '0.85rem 1rem' }}>Applied Standard</th>
                      <th style={{ padding: '0.85rem 1rem' }}>Permanent Student ID</th>
                      <th style={{ padding: '0.85rem 1rem' }}>Status</th>
                      <th style={{ padding: '0.85rem 1rem', textAlign: 'right' }}>Assign Section</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pendingClassAssignments.map((app, idx) => (
                      <tr key={app.application_id} style={{ borderBottom: idx < pendingClassAssignments.length - 1 ? '1px solid #F1F5F9' : 'none' }}>
                        <td style={{ padding: '0.85rem 1rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                            <code style={{ fontSize: '0.9rem', fontWeight: 800, color: '#1E3A8A', background: '#DBEAFE', padding: '0.2rem 0.5rem', borderRadius: '4px', border: '1px solid #BFDBFE' }}>
                              {app.enrolled_student_code || app.student_id || 'ID GENERATED'}
                            </code>
                          </div>
                          <div style={{ fontSize: '0.72rem', color: '#94A3B8', marginTop: '0.2rem' }}>
                            App: {app.application_id}
                          </div>
                        </td>
                        <td style={{ padding: '0.85rem 1rem' }}>
                          <div style={{ fontWeight: 700, color: '#1E293B' }}>{app.applicant_name}</div>
                          <div style={{ fontSize: '0.75rem', color: '#64748B' }}>Parent: {app.parent_name} (📞 {app.parent_phone})</div>
                        </td>
                        <td style={{ padding: '0.85rem 1rem' }}>
                          <span style={{ background: '#FDF4FF', color: '#701A75', border: '1px solid #F5D0FE', padding: '0.2rem 0.6rem', borderRadius: '4px', fontWeight: 700, fontSize: '0.82rem' }}>
                            Standard {app.requested_standard || 'N/A'}
                          </span>
                        </td>
                        <td style={{ padding: '0.85rem 1rem' }}>
                          <code style={{ fontSize: '0.78rem', color: '#4A044E', background: '#F3E8FF', padding: '0.15rem 0.4rem', borderRadius: '4px' }}>
                            {app.enrolled_student_id || 'Active'}
                          </code>
                        </td>
                        <td style={{ padding: '0.85rem 1rem' }}>
                          <span style={{ background: '#EFF8FF', color: '#175CD3', border: '1px solid #B2DDFF', padding: '0.2rem 0.6rem', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 700 }}>
                            🎟️ Seat Allotted
                          </span>
                        </td>
                        <td style={{ padding: '0.85rem 1rem', textAlign: 'right' }}>
                          <button
                            onClick={() => handleOpenAssignClassModal(app)}
                            style={{
                              background: '#701A75',
                              color: '#ffffff',
                              border: 'none',
                              borderRadius: '6px',
                              padding: '0.45rem 0.95rem',
                              fontSize: '0.8rem',
                              fontWeight: 700,
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.35rem',
                              boxShadow: '0 1px 3px rgba(112,26,117,0.3)'
                            }}
                          >
                            <span>👨‍🎓 Assign Section →</span>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          ) : (
            completedClassAssignments.length === 0 ? (
              <div style={{ background: '#F8FAFC', border: '1px dashed #CBD5E1', borderRadius: '10px', padding: '3.5rem 1rem', textAlign: 'center', color: '#64748B' }}>
                <span style={{ fontSize: '2.5rem', display: 'block', marginBottom: '0.5rem' }}>📋</span>
                <p style={{ margin: 0, fontWeight: 700, fontSize: '1rem', color: '#334155' }}>
                  No completed class enrolments yet.
                </p>
              </div>
            ) : (
              <div style={{ background: '#ffffff', border: '1px solid #E2E8F0', borderRadius: '10px', overflowX: 'auto', boxShadow: '0 2px 6px rgba(0,0,0,0.03)' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', color: '#475569', fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      <th style={{ padding: '0.85rem 1rem' }}>Student ID & Permanent ID</th>
                      <th style={{ padding: '0.85rem 1rem' }}>Student Name</th>
                      <th style={{ padding: '0.85rem 1rem' }}>Assigned Standard & Section</th>
                      <th style={{ padding: '0.85rem 1rem' }}>Academic Year</th>
                      <th style={{ padding: '0.85rem 1rem' }}>Enrolment Status</th>
                      <th style={{ padding: '0.85rem 1rem', textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {completedClassAssignments.map((app, idx) => (
                      <tr key={app.application_id} style={{ borderBottom: idx < completedClassAssignments.length - 1 ? '1px solid #F1F5F9' : 'none' }}>
                        <td style={{ padding: '0.85rem 1rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                            <code style={{ fontSize: '0.9rem', fontWeight: 800, color: '#1E3A8A', background: '#DBEAFE', padding: '0.2rem 0.5rem', borderRadius: '4px', border: '1px solid #BFDBFE' }}>
                              {app.enrolled_student_code || app.student_id || 'REGISTERED'}
                            </code>
                            <button
                              type="button"
                              onClick={() => handleCopyDeskId(app.enrolled_student_code || app.student_id, `cid_${app.application_id}`)}
                              style={{ background: copiedDeskIdMap[`cid_${app.application_id}`] ? '#10B981' : '#DBEAFE', color: copiedDeskIdMap[`cid_${app.application_id}`] ? '#ffffff' : '#1E40AF', border: 'none', padding: '0.2rem 0.45rem', borderRadius: '4px', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer' }}
                            >
                              {copiedDeskIdMap[`cid_${app.application_id}`] ? '✓' : 'Copy'}
                            </button>
                          </div>
                          <div style={{ fontSize: '0.72rem', color: '#64748B', marginTop: '0.2rem' }}>
                            PSID: {app.enrolled_student_id}
                          </div>
                        </td>
                        <td style={{ padding: '0.85rem 1rem' }}>
                          <div style={{ fontWeight: 700, color: '#1E293B' }}>{app.applicant_name}</div>
                          <div style={{ fontSize: '0.75rem', color: '#64748B' }}>Parent: {app.parent_name} (📞 {app.parent_phone})</div>
                        </td>
                        <td style={{ padding: '0.85rem 1rem' }}>
                          <span style={{ background: '#ECFDF3', color: '#027A48', border: '1px solid #A6F4C5', padding: '0.25rem 0.65rem', borderRadius: '6px', fontWeight: 800, fontSize: '0.85rem' }}>
                            Standard {app.enrolled_standard || app.requested_standard} — Section {app.enrolled_section || 'A'}
                          </span>
                        </td>
                        <td style={{ padding: '0.85rem 1rem' }}>
                          <span style={{ color: '#475467', fontWeight: 600 }}>{app.academic_year || '2026-2027'}</span>
                        </td>
                        <td style={{ padding: '0.85rem 1rem' }}>
                          <span style={{ background: '#FDF4FF', color: '#701A75', border: '1px solid #F5D0FE', padding: '0.2rem 0.6rem', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 700 }}>
                            🎓 Active Enrolment
                          </span>
                        </td>
                        <td style={{ padding: '0.85rem 1rem', textAlign: 'right' }}>
                          <button
                            onClick={() => handleInspect(app)}
                            style={{
                              background: '#155EEF',
                              color: '#ffffff',
                              border: 'none',
                              borderRadius: '6px',
                              padding: '0.4rem 0.85rem',
                              fontSize: '0.8rem',
                              fontWeight: 600,
                              cursor: 'pointer'
                            }}
                          >
                            View Record →
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          )}
        </div>
      )}

      {/* QUICK ALLOT SEAT MODAL */}
      {allottingSeatApp && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          background: 'rgba(15, 23, 42, 0.72)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10000,
          padding: '1rem'
        }}>
          <div style={{
            background: '#ffffff',
            borderRadius: '14px',
            width: '100%',
            maxWidth: '520px',
            boxShadow: '0 20px 45px rgba(0, 0, 0, 0.25)',
            padding: '1.75rem'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', borderBottom: '1px solid #E2E8F0', paddingBottom: '0.75rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ fontSize: '1.4rem' }}>🎟️</span>
                <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: '#102B46' }}>
                  Allot Seat & Generate Student ID
                </h3>
              </div>
              <button
                onClick={() => setAllottingSeatApp(null)}
                style={{ background: 'none', border: 'none', color: '#64748B', fontSize: '1.25rem', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: '8px', padding: '1rem', marginBottom: '1.25rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', fontSize: '0.85rem' }}>
                <div>
                  <span style={{ color: '#166534', fontSize: '0.75rem', fontWeight: 600 }}>APPLICANT</span>
                  <div style={{ fontWeight: 700, color: '#14532D' }}>{allottingSeatApp.applicant_name}</div>
                </div>
                <div>
                  <span style={{ color: '#166534', fontSize: '0.75rem', fontWeight: 600 }}>TARGET STANDARD</span>
                  <div style={{ fontWeight: 700, color: '#14532D' }}>Standard {allottingSeatApp.requested_standard}</div>
                </div>
                <div>
                  <span style={{ color: '#166534', fontSize: '0.75rem', fontWeight: 600 }}>APPLICATION ID</span>
                  <div style={{ fontFamily: 'monospace', fontWeight: 700, color: '#14532D' }}>{allottingSeatApp.application_id}</div>
                </div>
                <div>
                  <span style={{ color: '#166534', fontSize: '0.75rem', fontWeight: 600 }}>DEMO FEE STATUS</span>
                  <div style={{ fontWeight: 700, color: '#15803D' }}>✓ ₹{(allottingSeatApp.payment_amount || 1200).toFixed(0)} PAID</div>
                </div>
              </div>
            </div>

            <p style={{ fontSize: '0.85rem', color: '#475467', lineHeight: 1.5, margin: '0 0 1rem 0' }}>
              Allotting a seat will generate an official, canonical Student ID (e.g. <code>SCH01125</code>) and permanent ID, link parent-guardian records in the database, and immediately notify the parent in their dashboard with their official Student ID.
            </p>

            <div style={{ marginBottom: '1.25rem' }}>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#344054', marginBottom: '0.35rem' }}>
                Seat Allotment Notes (Optional)
              </label>
              <input
                type="text"
                placeholder="e.g. Merit quota seat allotment verified."
                value={seatAllotNotes}
                onChange={(e) => setSeatAllotNotes(e.target.value)}
                style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '0.85rem' }}
              />
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setAllottingSeatApp(null)}
                style={{ background: '#F1F5F9', border: '1px solid #CBD5E1', color: '#475467', padding: '0.55rem 1rem', borderRadius: '6px', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={allottingSubmitting}
                onClick={handleConfirmSeatAllotment}
                style={{
                  background: '#027A48',
                  border: 'none',
                  color: '#ffffff',
                  padding: '0.55rem 1.25rem',
                  borderRadius: '6px',
                  fontWeight: 700,
                  fontSize: '0.85rem',
                  cursor: allottingSubmitting ? 'not-allowed' : 'pointer'
                }}
              >
                {allottingSubmitting ? 'Generating ID...' : 'Confirm Allotment & Generate ID ✓'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* QUICK ASSIGN CLASS MODAL */}
      {assigningClassApp && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          background: 'rgba(15, 23, 42, 0.72)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10000,
          padding: '1rem'
        }}>
          <div style={{
            background: '#ffffff',
            borderRadius: '14px',
            width: '100%',
            maxWidth: '560px',
            boxShadow: '0 20px 45px rgba(0, 0, 0, 0.25)',
            padding: '1.75rem'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', borderBottom: '1px solid #E2E8F0', paddingBottom: '0.75rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ fontSize: '1.4rem' }}>👨‍🎓</span>
                <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: '#102B46' }}>
                  Assign Class & Section
                </h3>
              </div>
              <button
                onClick={() => setAssigningClassApp(null)}
                style={{ background: 'none', border: 'none', color: '#64748B', fontSize: '1.25rem', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            <div style={{ background: '#FDF4FF', border: '1px solid #F5D0FE', borderRadius: '8px', padding: '1rem', marginBottom: '1.25rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', fontSize: '0.85rem' }}>
                <div>
                  <span style={{ color: '#701A75', fontSize: '0.75rem', fontWeight: 600 }}>STUDENT NAME</span>
                  <div style={{ fontWeight: 700, color: '#4A044E' }}>{assigningClassApp.applicant_name || assigningClassApp.student_name}</div>
                </div>
                <div>
                  <span style={{ color: '#701A75', fontSize: '0.75rem', fontWeight: 600 }}>OFFICIAL STUDENT ID</span>
                  <div style={{ fontWeight: 800, color: '#1E3A8A' }}>{assigningClassApp.enrolled_student_code || assigningClassApp.student_id || 'ID RECORDED'}</div>
                </div>
                <div>
                  <span style={{ color: '#701A75', fontSize: '0.75rem', fontWeight: 600 }}>MANDATORY STANDARD</span>
                  <div style={{ fontWeight: 700, color: '#4A044E' }}>Standard {assigningClassApp.requested_standard || assigningClassApp.standard} (Locked)</div>
                </div>
                <div>
                  <span style={{ color: '#701A75', fontSize: '0.75rem', fontWeight: 600 }}>ACADEMIC YEAR</span>
                  <div style={{ fontWeight: 700, color: '#4A044E' }}>{assigningClassApp.academic_year || '2026-2027'}</div>
                </div>
              </div>
            </div>

            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#102B46', marginBottom: '0.5rem' }}>
              Select Active Section (Standard {assigningClassApp.requested_standard || assigningClassApp.standard}) *
            </label>

            {loadingSections ? (
              <p style={{ fontSize: '0.85rem', color: '#64748B' }}>Loading sections and capacity...</p>
            ) : availableSections.length === 0 ? (
              <div style={{ background: '#FEF3F2', border: '1px solid #FECDCA', padding: '0.75rem', borderRadius: '6px', color: '#B42318', fontSize: '0.85rem', marginBottom: '1rem' }}>
                No active sections found for Standard {assigningClassApp.requested_standard || assigningClassApp.standard}.
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem', marginBottom: '1.25rem' }}>
                {availableSections.map((sec) => (
                  <div
                    key={sec.section_id}
                    onClick={() => !sec.is_full && setSelectedSectionId(sec.section_id)}
                    style={{
                      border: `2px solid ${selectedSectionId === sec.section_id ? '#701A75' : '#E2E8F0'}`,
                      borderRadius: '8px',
                      padding: '0.75rem',
                      background: selectedSectionId === sec.section_id ? '#FAF5FF' : sec.is_full ? '#F1F5F9' : '#ffffff',
                      cursor: sec.is_full ? 'not-allowed' : 'pointer',
                      opacity: sec.is_full ? 0.6 : 1
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                      <strong style={{ fontSize: '0.95rem', color: '#102B46' }}>
                        Section {sec.section_name}
                      </strong>
                      {selectedSectionId === sec.section_id && <span style={{ color: '#701A75', fontWeight: 700, fontSize: '0.8rem' }}>✓ Selected</span>}
                    </div>
                    <div style={{ fontSize: '0.78rem', color: '#475467' }}>
                      Strength: <strong>{sec.current_strength}</strong> / {sec.capacity}
                    </div>
                    <div style={{ fontSize: '0.78rem', marginTop: '0.25rem', fontWeight: 600, color: sec.is_full ? '#B42318' : '#027A48' }}>
                      {sec.is_full ? '❌ Full' : `✓ ${sec.available_seats} Available`}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setAssigningClassApp(null)}
                style={{ background: '#F1F5F9', border: '1px solid #CBD5E1', color: '#475467', padding: '0.55rem 1rem', borderRadius: '6px', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={allottingSubmitting || !selectedSectionId}
                onClick={handleConfirmClassAssignment}
                style={{
                  background: !selectedSectionId ? '#94A3B8' : '#701A75',
                  border: 'none',
                  color: '#ffffff',
                  padding: '0.55rem 1.25rem',
                  borderRadius: '6px',
                  fontWeight: 700,
                  fontSize: '0.85rem',
                  cursor: allottingSubmitting || !selectedSectionId ? 'not-allowed' : 'pointer'
                }}
              >
                {allottingSubmitting ? 'Enrolling...' : 'Confirm Class Assignment ✓'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* INSPECTION & REVIEW MODAL */}
      {activeApp && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          background: 'rgba(15, 23, 42, 0.72)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '1rem'
        }}>
          <div style={{
            background: '#ffffff',
            borderRadius: '16px',
            width: '100%',
            maxWidth: '780px',
            maxHeight: '92vh',
            overflowY: 'auto',
            boxShadow: '0 20px 45px rgba(0, 0, 0, 0.25)',
            display: 'flex',
            flexDirection: 'column'
          }}>
            {/* Header */}
            <div style={{
              background: '#102B46',
              color: '#ffffff',
              padding: '1.25rem 1.75rem',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              borderTopLeftRadius: '16px',
              borderTopRightRadius: '16px'
            }}>
              <div>
                <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: '#94A3B8', fontWeight: 600 }}>
                  Admission Desk Review
                </span>
                <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800 }}>
                  Application: {activeApp.application_id}
                </h3>
              </div>
              <button
                onClick={() => setActiveApp(null)}
                style={{ background: 'none', border: 'none', color: '#ffffff', fontSize: '1.25rem', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            <div style={{ padding: '1.75rem' }}>
              {/* Payment Status Notification Banner */}
              {activeApp.payment_status === 'PAID_DEMO' ? (
                <div style={{ background: '#ECFDF3', border: '1px solid #A6F4C5', borderRadius: '10px', padding: '0.85rem 1.25rem', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ fontSize: '1.2rem' }}>💳</span>
                    <div>
                      <strong style={{ color: '#027A48', fontSize: '0.9rem' }}>Demo Fee Payment Verified: PAID_DEMO</strong>
                      <div style={{ fontSize: '0.78rem', color: '#05603A' }}>
                        Reference: <code style={{ fontWeight: 700 }}>{activeApp.payment_ref}</code> • Amount: ₹{(activeApp.payment_amount || 1200).toFixed(2)} • Ready for final enrolment.
                      </div>
                    </div>
                  </div>
                  <span style={{ background: '#027A48', color: '#ffffff', padding: '0.2rem 0.6rem', borderRadius: '12px', fontSize: '0.72rem', fontWeight: 700 }}>
                    PAYMENT VERIFIED ✓
                  </span>
                </div>
              ) : (activeApp.status === 'detailed_review_completed' || activeApp.status === 'stage2_approved') && (
                <div style={{ background: '#FFFAEB', border: '1px solid #FEDF89', borderRadius: '10px', padding: '0.85rem 1.25rem', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <span style={{ fontSize: '1.4rem' }}>🎉</span>
                  <div>
                    <strong style={{ color: '#92400E', fontSize: '0.95rem' }}>Payment QR has been sent to the parent! (Fee Status: {activeApp.payment_status || 'PENDING'})</strong>
                    <div style={{ fontSize: '0.82rem', color: '#78350F', marginTop: '0.2rem' }}>
                      Stage 2 admission review has been completed successfully. Parent can proceed to their dashboard to complete the ₹1,200 demo fee payment via QR code.
                    </div>
                  </div>
                </div>
              )}

              {/* Enrolled Status Banner */}
              {(activeApp.status === 'enrolled' || activeApp.status === 'final_admission_confirmed') && (
                <div style={{ background: '#FDF4FF', border: '1px solid #FCCEEE', borderRadius: '12px', padding: '1.25rem', marginBottom: '1.5rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1rem', borderBottom: '1px dashed #F5D0FE', paddingBottom: '0.75rem' }}>
                    <div>
                      <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: '#701A75', fontWeight: 800 }}>
                        Official Academic Ledger Record
                      </span>
                      <h4 style={{ margin: '0.2rem 0', color: '#4A044E', fontSize: '1.1rem', fontWeight: 800 }}>
                        🎓 Student Officially Enrolled
                      </h4>
                    </div>
                    <span style={{ background: '#701A75', color: '#ffffff', padding: '0.35rem 0.75rem', borderRadius: '20px', fontSize: '0.8rem', fontWeight: 700 }}>
                      Active Enrolment
                    </span>
                  </div>

                  {/* STUDENT ENROLLMENT DETAILS Card */}
                  <div style={{ background: '#FFFFFF', padding: '1rem', borderRadius: '8px', border: '1px solid #F5D0FE' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', borderBottom: '1px solid #F3E8FF', paddingBottom: '0.4rem' }}>
                      <strong style={{ fontSize: '0.85rem', fontWeight: 800, color: '#581C87', letterSpacing: '0.04em' }}>
                        📋 STUDENT ENROLLMENT DETAILS
                      </strong>
                      <span style={{ background: '#DCFCE7', color: '#166534', border: '1px solid #BBF7D0', padding: '0.15rem 0.5rem', borderRadius: '9999px', fontSize: '0.72rem', fontWeight: 700 }}>
                        ENROLLED
                      </span>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem' }}>
                      <div>
                        <span style={{ color: '#86198F', fontSize: '0.72rem', fontWeight: 600, display: 'block' }}>STUDENT NAME</span>
                        <strong style={{ fontSize: '0.9rem', color: '#1E293B' }}>{activeApp.applicant_name}</strong>
                      </div>

                      <div>
                        <span style={{ color: '#86198F', fontSize: '0.72rem', fontWeight: 600, display: 'block' }}>PERMANENT STUDENT ID</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.15rem' }}>
                          <code style={{ fontSize: '0.85rem', fontWeight: 800, color: '#4A044E', background: '#F3E8FF', padding: '0.15rem 0.4rem', borderRadius: '4px' }}>
                            {activeApp.enrolled_student_id || 'Active'}
                          </code>
                          {activeApp.enrolled_student_id && (
                            <button
                              type="button"
                              onClick={() => handleCopyDeskId(activeApp.enrolled_student_id, `psid_${activeApp.application_id}`)}
                              style={{ background: copiedDeskIdMap[`psid_${activeApp.application_id}`] ? '#10B981' : '#F5D0FE', color: copiedDeskIdMap[`psid_${activeApp.application_id}`] ? '#ffffff' : '#701A75', border: 'none', padding: '0.15rem 0.45rem', borderRadius: '4px', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer' }}
                              title="Copy Permanent Student ID"
                            >
                              {copiedDeskIdMap[`psid_${activeApp.application_id}`] ? '✓ Copied!' : 'Copy'}
                            </button>
                          )}
                        </div>
                      </div>

                      <div>
                        <span style={{ color: '#86198F', fontSize: '0.72rem', fontWeight: 600, display: 'block' }}>INSTITUTIONAL STUDENT ID</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.15rem' }}>
                          <code style={{ fontSize: '0.95rem', fontWeight: 800, color: '#1E3A8A', background: '#DBEAFE', padding: '0.15rem 0.45rem', borderRadius: '4px', border: '1px solid #BFDBFE' }}>
                            {activeApp.enrolled_student_code || activeApp.student_id || 'SCH-REGISTERED'}
                          </code>
                          {(activeApp.enrolled_student_code || activeApp.student_id) && (
                            <button
                              type="button"
                              onClick={() => handleCopyDeskId(activeApp.enrolled_student_code || activeApp.student_id, `sid_${activeApp.application_id}`)}
                              style={{ background: copiedDeskIdMap[`sid_${activeApp.application_id}`] ? '#10B981' : '#DBEAFE', color: copiedDeskIdMap[`sid_${activeApp.application_id}`] ? '#ffffff' : '#1E40AF', border: 'none', padding: '0.15rem 0.45rem', borderRadius: '4px', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer' }}
                              title="Copy Institutional Student ID"
                            >
                              {copiedDeskIdMap[`sid_${activeApp.application_id}`] ? '✓ Copied!' : 'Copy'}
                            </button>
                          )}
                        </div>
                      </div>

                      <div>
                        <span style={{ color: '#86198F', fontSize: '0.72rem', fontWeight: 600, display: 'block' }}>STANDARD & SECTION</span>
                        <strong style={{ fontSize: '0.85rem', color: '#1E293B' }}>
                          Standard {activeApp.enrolled_standard || activeApp.requested_standard} — Section {activeApp.enrolled_section || 'A'}
                        </strong>
                      </div>

                      <div>
                        <span style={{ color: '#86198F', fontSize: '0.72rem', fontWeight: 600, display: 'block' }}>ACADEMIC YEAR</span>
                        <strong style={{ fontSize: '0.85rem', color: '#1E293B' }}>{activeApp.academic_year || '2026-2027'}</strong>
                      </div>

                      <div>
                        <span style={{ color: '#86198F', fontSize: '0.72rem', fontWeight: 600, display: 'block' }}>DEMO FEE STATUS</span>
                        <span style={{ color: '#027A48', fontWeight: 700, fontSize: '0.82rem' }}>
                          ✓ ₹1,200 PAID (Ref: {activeApp.payment_ref || 'PAY-DEMO-RECORDED'})
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
              {/* Details Grid */}
              <div style={{
                background: '#F8FAFC',
                border: '1px solid #E2E8F0',
                borderRadius: '10px',
                padding: '1.25rem',
                marginBottom: '1.5rem',
                fontSize: '0.875rem'
              }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
                  <div>
                    <span style={{ fontSize: '0.75rem', color: '#64748B', display: 'block' }}>Applicant Name</span>
                    <strong style={{ color: '#102B46', fontSize: '1rem' }}>{activeApp.applicant_name}</strong>
                  </div>
                  <div>
                    <span style={{ fontSize: '0.75rem', color: '#64748B', display: 'block' }}>Current Status</span>
                    <div>{renderStatusBadge(activeApp.status, activeApp.payment_status)}</div>
                  </div>
                  <div>
                    <span style={{ fontSize: '0.75rem', color: '#64748B', display: 'block' }}>Parent / Guardian</span>
                    <strong style={{ color: '#102B46' }}>{activeApp.parent_name}</strong>
                    <div style={{ color: '#155EEF', fontSize: '0.8rem' }}>📞 {activeApp.parent_phone}</div>
                    {activeApp.parent_email && <div style={{ color: '#64748B', fontSize: '0.78rem' }}>✉️ {activeApp.parent_email}</div>}
                  </div>
                  <div>
                    <span style={{ fontSize: '0.75rem', color: '#64748B', display: 'block' }}>Target Level & Program</span>
                    <strong style={{ color: '#102B46', textTransform: 'capitalize' }}>{activeApp.education_level?.replace('_', ' ')}</strong>
                    <div style={{ color: '#334155', fontSize: '0.85rem' }}>
                      {activeApp.education_level === 'school' && `Standard ${activeApp.requested_standard} (Lang: ${activeApp.first_language_preference})`}
                      {activeApp.education_level === 'higher_secondary' && `Combination: ${activeApp.combination_code || activeApp.stream_preference}`}
                      {(activeApp.education_level === 'diploma' || activeApp.education_level === 'undergraduate') && activeApp.requested_program_id}
                    </div>
                  </div>
                  <div style={{ gridColumn: 'span 2', borderTop: '1px solid #E2E8F0', paddingTop: '0.5rem' }}>
                    <span style={{ fontSize: '0.75rem', color: '#64748B', display: 'block' }}>Residential Catchment Address</span>
                    <span style={{ color: '#334155' }}>{activeApp.residential_address}</span>
                  </div>
                </div>
              </div>

              {/* Status Audit History Timeline */}
              <div style={{ marginBottom: '1.5rem' }}>
                <h4 style={{ margin: '0 0 0.75rem 0', fontSize: '0.95rem', color: '#102B46', fontWeight: 700 }}>
                  📜 Status Transition Audit History
                </h4>
                {loadingHistory ? (
                  <p style={{ fontSize: '0.85rem', color: '#64748B' }}>Loading timeline...</p>
                ) : history.length === 0 ? (
                  <p style={{ fontSize: '0.85rem', color: '#64748B' }}>No transitions recorded yet.</p>
                ) : (
                  <div style={{ borderLeft: '2px solid #CBD5E1', marginLeft: '0.5rem', paddingLeft: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {history.map((h, i) => (
                      <div key={i} style={{ fontSize: '0.85rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span style={{ fontWeight: 700, color: '#102B46', textTransform: 'uppercase', fontSize: '0.75rem' }}>
                            {h.new_status?.replace('_', ' ')}
                          </span>
                          <span style={{ fontSize: '0.75rem', color: '#94A3B8' }}>
                            {h.created_at ? new Date(h.created_at).toLocaleString() : ''}
                          </span>
                        </div>
                        <div style={{ color: '#475569', fontSize: '0.82rem', marginTop: '0.15rem' }}>
                          {h.action_note || 'Status updated.'}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* STAGE 2 DEMOGRAPHIC & ACADEMIC DOSSIER */}
              {stage2Dossier?.stage2_submission ? (
                <div style={{ background: '#F0F9FF', border: '1px solid #B9E6FE', borderRadius: '10px', padding: '1.25rem', marginBottom: '1.5rem' }}>
                  <h4 style={{ margin: '0 0 0.75rem 0', fontSize: '0.95rem', color: '#026AA2', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    📋 Stage 2 Detailed Demographic & Academic Dossier
                  </h4>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem', fontSize: '0.85rem' }}>
                    <div>
                      <span style={{ color: '#64748B', fontSize: '0.75rem', display: 'block' }}>Date of Birth</span>
                      <strong>{stage2Dossier.stage2_submission.date_of_birth || 'N/A'}</strong>
                    </div>
                    <div>
                      <span style={{ color: '#64748B', fontSize: '0.75rem', display: 'block' }}>Gender / Blood Group</span>
                      <strong style={{ textTransform: 'capitalize' }}>{stage2Dossier.stage2_submission.gender} • {stage2Dossier.stage2_submission.blood_group}</strong>
                    </div>
                    <div>
                      <span style={{ color: '#64748B', fontSize: '0.75rem', display: 'block' }}>Emergency Contact</span>
                      <strong>{stage2Dossier.stage2_submission.emergency_contact_name || 'N/A'} ({stage2Dossier.stage2_submission.emergency_contact_phone || 'N/A'})</strong>
                    </div>
                    <div>
                      <span style={{ color: '#64748B', fontSize: '0.75rem', display: 'block' }}>Previous Institution</span>
                      <strong>{stage2Dossier.stage2_submission.previous_institution_name || 'N/A'}</strong>
                      <div style={{ fontSize: '0.75rem', color: '#64748B' }}>{stage2Dossier.stage2_submission.previous_institution_location}</div>
                    </div>
                    <div>
                      <span style={{ color: '#64748B', fontSize: '0.75rem', display: 'block' }}>Previous Class / Board</span>
                      <strong>{stage2Dossier.stage2_submission.previous_standard_or_degree} • {stage2Dossier.stage2_submission.previous_board}</strong>
                    </div>
                    <div>
                      <span style={{ color: '#64748B', fontSize: '0.75rem', display: 'block' }}>Previous Marks Score</span>
                      <strong style={{ color: '#027A48' }}>{stage2Dossier.stage2_submission.previous_marks_percentage ? `${stage2Dossier.stage2_submission.previous_marks_percentage}%` : 'N/A'}</strong>
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{ background: '#F8FAFC', border: '1px dashed #CBD5E1', borderRadius: '10px', padding: '1rem', marginBottom: '1.5rem', fontSize: '0.85rem', color: '#64748B' }}>
                  ℹ️ Stage 2 detailed demographic & previous schooling dossier has not yet been submitted by the parent.
                </div>
              )}

              {/* STAGE 2 SUPPORTING DOCUMENTS & VERIFICATION */}
              <div style={{ background: '#ffffff', border: '1px solid #E2E8F0', borderRadius: '10px', padding: '1.25rem', marginBottom: '1.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                  <h4 style={{ margin: 0, fontSize: '0.95rem', color: '#102B46', fontWeight: 700 }}>
                    📁 Stage 2 Supporting Certificates & Verification ({uploadedDocs.length})
                  </h4>
                  <span style={{ fontSize: '0.75rem', color: '#64748B' }}>
                    Authenticity verification required before final seat allotment
                  </span>
                </div>

                {uploadedDocs.length === 0 ? (
                  <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748B', fontStyle: 'italic' }}>
                    No digital verification certificates uploaded yet for this application.
                  </p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                    {uploadedDocs.map((doc) => (
                      <div
                        key={doc.document_id}
                        style={{
                          border: '1px solid #E2E8F0',
                          borderRadius: '8px',
                          padding: '0.85rem',
                          background: doc.verification_status === 'verified' ? '#F6FEF9' : doc.verification_status === 'rejected' ? '#FEF3F2' : '#F8FAFC'
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.5rem' }}>
                          <div>
                            <span style={{ fontSize: '0.72rem', textTransform: 'uppercase', fontWeight: 700, color: '#475569', background: '#E2E8F0', padding: '0.15rem 0.4rem', borderRadius: '4px' }}>
                              {doc.document_type?.replace(/_/g, ' ')}
                            </span>
                            <div style={{ fontWeight: 600, color: '#1E293B', fontSize: '0.9rem', marginTop: '0.2rem' }}>
                              📄 {doc.file_name}
                            </div>
                            <div style={{ fontSize: '0.75rem', color: '#64748B' }}>
                              Size: {(doc.file_size_bytes / 1024).toFixed(1)} KB • Uploaded {doc.uploaded_at ? new Date(doc.uploaded_at).toLocaleDateString() : 'Recently'}
                            </div>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <a
                              href={`${API_URL}/admissions/applications/${activeApp.application_id}/documents/${doc.document_id}/file`}
                              target="_blank"
                              rel="noreferrer"
                              style={{
                                background: '#102B46',
                                color: '#ffffff',
                                textDecoration: 'none',
                                padding: '0.3rem 0.65rem',
                                borderRadius: '4px',
                                fontSize: '0.75rem',
                                fontWeight: 600
                              }}
                            >
                              👁️ View Document
                            </a>
                            <span
                              style={{
                                padding: '0.25rem 0.65rem',
                                borderRadius: '12px',
                                fontSize: '0.75rem',
                                fontWeight: 700,
                                background: doc.verification_status === 'verified' ? '#ECFDF3' : doc.verification_status === 'rejected' ? '#FEF3F2' : doc.verification_status === 'reupload_requested' ? '#FFFAEB' : '#EFF8FF',
                                color: doc.verification_status === 'verified' ? '#027A48' : doc.verification_status === 'rejected' ? '#B42318' : doc.verification_status === 'reupload_requested' ? '#B54708' : '#175CD3',
                                border: `1px solid ${doc.verification_status === 'verified' ? '#A6F4C5' : doc.verification_status === 'rejected' ? '#FECDCA' : doc.verification_status === 'reupload_requested' ? '#FEDF89' : '#B2DDFF'}`
                              }}
                            >
                              {doc.verification_status?.toUpperCase() || 'PENDING'}
                            </span>
                          </div>
                        </div>

                        {doc.verification_notes && (
                          <div style={{ fontSize: '0.78rem', color: '#475569', background: '#ffffff', padding: '0.4rem 0.6rem', borderRadius: '4px', border: '1px solid #E2E8F0', marginBottom: '0.5rem' }}>
                            <strong>Staff Note:</strong> {doc.verification_notes}
                          </div>
                        )}

                        {/* OCR Intelligence Card */}
                        {ocrResultsMap[doc.document_id] && (
                          <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: '6px', padding: '0.75rem', marginBottom: '0.5rem', fontSize: '0.8rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem', borderBottom: '1px solid #DCFCE7', paddingBottom: '0.25rem' }}>
                              <span style={{ fontWeight: 700, color: '#166534', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                                🤖 Real IDP Extraction: {ocrResultsMap[doc.document_id].ocr_engine}
                              </span>
                              <span style={{ background: '#DCFCE7', color: '#15803D', fontWeight: 800, padding: '0.1rem 0.4rem', borderRadius: '4px', fontSize: '0.72rem' }}>
                                Confidence: {ocrResultsMap[doc.document_id].confidence_percentage}%
                              </span>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.4rem', marginBottom: '0.4rem', color: '#14532D' }}>
                              {ocrResultsMap[doc.document_id].extracted_entities?.candidate_name && (
                                <div>Name: <strong>{ocrResultsMap[doc.document_id].extracted_entities.candidate_name}</strong></div>
                              )}
                              {ocrResultsMap[doc.document_id].extracted_entities?.date_of_birth && (
                                <div>DOB: <strong>{ocrResultsMap[doc.document_id].extracted_entities.date_of_birth}</strong></div>
                              )}
                              {ocrResultsMap[doc.document_id].extracted_entities?.registration_number && (
                                <div>Reg/TC No: <strong>{ocrResultsMap[doc.document_id].extracted_entities.registration_number}</strong></div>
                              )}
                              {ocrResultsMap[doc.document_id].extracted_entities?.issuing_authority && (
                                <div style={{ gridColumn: 'span 2' }}>Authority: <strong>{ocrResultsMap[doc.document_id].extracted_entities.issuing_authority}</strong></div>
                              )}
                            </div>

                            {ocrResultsMap[doc.document_id].discrepancy_notes && (
                              <div style={{ fontSize: '0.75rem', color: ocrResultsMap[doc.document_id].match_status === 'discrepancy_detected' ? '#B91C1C' : '#166534', background: '#ffffff', padding: '0.25rem 0.5rem', borderRadius: '4px', border: '1px solid #DCFCE7' }}>
                                <strong>Comparison Audit:</strong> {ocrResultsMap[doc.document_id].discrepancy_notes}
                              </div>
                            )}
                          </div>
                        )}

                        {/* Document Staff Action Controls */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', borderTop: '1px dashed #CBD5E1', paddingTop: '0.5rem' }}>
                          <input
                            type="text"
                            placeholder="Verification feedback notes (required if rejecting / requesting re-upload)..."
                            value={docNotesMap[doc.document_id] || ''}
                            onChange={(e) => setDocNotesMap({ ...docNotesMap, [doc.document_id]: e.target.value })}
                            style={{ flex: 1, minWidth: '220px', padding: '0.3rem 0.6rem', borderRadius: '4px', border: '1px solid #CBD5E1', fontSize: '0.78rem' }}
                          />
                          <button
                            type="button"
                            disabled={verifyingDocId === doc.document_id}
                            onClick={() => handleVerifyDocument(doc.document_id, 'verified')}
                            style={{ background: '#027A48', color: '#ffffff', border: 'none', padding: '0.3rem 0.65rem', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}
                          >
                            ✓ Verify
                          </button>
                          <button
                            type="button"
                            disabled={verifyingDocId === doc.document_id}
                            onClick={() => handleVerifyDocument(doc.document_id, 'reupload_requested')}
                            style={{ background: '#B54708', color: '#ffffff', border: 'none', padding: '0.3rem 0.65rem', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer' }}
                          >
                            ⚠️ Re-upload
                          </button>
                          <button
                            type="button"
                            disabled={verifyingDocId === doc.document_id}
                            onClick={() => handleVerifyDocument(doc.document_id, 'rejected')}
                            style={{ background: '#B42318', color: '#ffffff', border: 'none', padding: '0.3rem 0.65rem', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer' }}
                          >
                            ✕ Reject
                          </button>
                          <button
                            type="button"
                            disabled={analyzingDocId === doc.document_id}
                            onClick={() => handleRunOcr(doc.document_id)}
                            style={{ background: '#0E7090', color: '#ffffff', border: 'none', padding: '0.3rem 0.75rem', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}
                          >
                            {analyzingDocId === doc.document_id ? 'Analyzing...' : '🔍 Run OCR Intelligence'}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Action Buttons Toolbar */}
              <div style={{ borderTop: '1px solid #E2E8F0', paddingTop: '1.25rem', marginBottom: '1rem' }}>
                <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', display: 'block', marginBottom: '0.5rem' }}>
                  Institutional Action Controls
                </span>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <button
                    onClick={() => { setActionType('review'); setActionError(null); }}
                    style={{
                      background: actionType === 'review' ? '#3E4784' : '#F8F9FC',
                      color: actionType === 'review' ? '#ffffff' : '#3E4784',
                      border: '1px solid #D5D9EB',
                      padding: '0.5rem 1rem',
                      borderRadius: '6px',
                      fontWeight: 600,
                      fontSize: '0.85rem',
                      cursor: 'pointer'
                    }}
                  >
                    🔍 Take Up for Review
                  </button>

                  <button
                    onClick={() => { setActionType('clarify'); setActionError(null); }}
                    style={{
                      background: actionType === 'clarify' ? '#B54708' : '#FFFAEB',
                      color: actionType === 'clarify' ? '#ffffff' : '#B54708',
                      border: '1px solid #FEDF89',
                      padding: '0.5rem 1rem',
                      borderRadius: '6px',
                      fontWeight: 600,
                      fontSize: '0.85rem',
                      cursor: 'pointer'
                    }}
                  >
                    💬 Request Clarification
                  </button>

                  {(permissions.can_recommend_decision ?? true) && (
                    <button
                      onClick={() => { setActionType('recommend'); setActionError(null); }}
                      style={{
                        background: actionType === 'recommend' ? '#026AA2' : '#F0F9FF',
                        color: actionType === 'recommend' ? '#ffffff' : '#026AA2',
                        border: '1px solid #B2DDFF',
                        padding: '0.5rem 1rem',
                        borderRadius: '6px',
                        fontWeight: 700,
                        fontSize: '0.85rem',
                        cursor: 'pointer'
                      }}
                    >
                      👍 Recommend Decision to Admin
                    </button>
                  )}

                  <button
                    onClick={() => { setActionType('approve'); setActionError(null); }}
                    style={{
                      background: actionType === 'approve' ? '#027A48' : '#ECFDF3',
                      color: actionType === 'approve' ? '#ffffff' : '#027A48',
                      border: '1px solid #A6F4C5',
                      padding: '0.5rem 1rem',
                      borderRadius: '6px',
                      fontWeight: 700,
                      fontSize: '0.85rem',
                      cursor: 'pointer'
                    }}
                  >
                    ✓ Approve Stage 1 {permissions.can_approve_stage1 === false ? '(Admin Authorization Required)' : ''}
                  </button>

                  <button
                    onClick={() => { setActionType('reject'); setActionError(null); }}
                    style={{
                      background: actionType === 'reject' ? '#B42318' : '#FEF3F2',
                      color: actionType === 'reject' ? '#ffffff' : '#B42318',
                      border: '1px solid #FECDCA',
                      padding: '0.5rem 1rem',
                      borderRadius: '6px',
                      fontWeight: 600,
                      fontSize: '0.85rem',
                      cursor: 'pointer'
                    }}
                  >
                    ✕ Reject Application
                  </button>

                  <button
                    onClick={() => { setActionType('complete_stage2'); setActionError(null); }}
                    style={{
                      background: actionType === 'complete_stage2' ? '#0E7090' : '#ECFEFF',
                      color: actionType === 'complete_stage2' ? '#ffffff' : '#0E7090',
                      border: '1px solid #A5F3FC',
                      padding: '0.5rem 1rem',
                      borderRadius: '6px',
                      fontWeight: 700,
                      fontSize: '0.85rem',
                      cursor: 'pointer'
                    }}
                  >
                    📋 Complete Stage 2 Review
                  </button>

                  <button
                    onClick={() => { setActionType('allot_seat'); setActionError(null); }}
                    style={{
                      background: actionType === 'allot_seat' ? '#027A48' : '#ECFDF3',
                      color: actionType === 'allot_seat' ? '#ffffff' : '#027A48',
                      border: '1px solid #A6F4C5',
                      padding: '0.5rem 1rem',
                      borderRadius: '6px',
                      fontWeight: 700,
                      fontSize: '0.85rem',
                      cursor: 'pointer'
                    }}
                  >
                    🎟️ Allot Seat & ID
                  </button>

                  <button
                    onClick={async () => {
                      setActionType('assign_class')
                      setActionError(null)
                      setLoadingSections(true)
                      try {
                        const secs = await apiGet(`/school/admissions/${activeApp.application_id}/available-sections`)
                        const list = Array.isArray(secs) ? secs : []
                        setAvailableSections(list)
                        const avail = list.find(s => !s.is_full) || list[0]
                        if (avail) setSelectedSectionId(avail.section_id)
                      } catch {
                        setAvailableSections([])
                      } finally {
                        setLoadingSections(false)
                      }
                    }}
                    style={{
                      background: actionType === 'assign_class' ? '#701A75' : '#FDF4FF',
                      color: actionType === 'assign_class' ? '#ffffff' : '#701A75',
                      border: '1px solid #F5D0FE',
                      padding: '0.5rem 1rem',
                      borderRadius: '6px',
                      fontWeight: 700,
                      fontSize: '0.85rem',
                      cursor: 'pointer'
                    }}
                  >
                    👨‍🎓 Assign Class & Section
                  </button>

                  <button
                    onClick={() => { setActionType('confirm_enrolment'); setActionError(null); }}
                    style={{
                      background: actionType === 'confirm_enrolment' ? '#701A75' : '#FDF4FF',
                      color: actionType === 'confirm_enrolment' ? '#ffffff' : '#701A75',
                      border: '1px solid #F5D0FE',
                      padding: '0.5rem 1rem',
                      borderRadius: '6px',
                      fontWeight: 700,
                      fontSize: '0.85rem',
                      cursor: 'pointer'
                    }}
                  >
                    🎓 Final Admission Confirmation & Enrolment
                  </button>
                </div>
              </div>

              {/* Action Form Panels */}
              {actionError && (
                <div style={{ background: '#FEF3F2', border: '1px solid #FECDCA', color: '#B42318', padding: '0.75rem', borderRadius: '6px', marginBottom: '1rem', fontSize: '0.85rem' }}>
                  ⚠️ {actionError}
                </div>
              )}

              {actionType === 'review' && (
                <div style={{ background: '#F8F9FC', border: '1px solid #D5D9EB', borderRadius: '8px', padding: '1rem', marginBottom: '1rem' }}>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#3E4784', marginBottom: '0.35rem' }}>
                    Staff Review Notes (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Verified residential catchment zone and standard capacity."
                    value={actionNotes}
                    onChange={(e) => setActionNotes(e.target.value)}
                    style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '0.85rem', marginBottom: '0.75rem' }}
                  />
                  <button
                    onClick={handleExecuteAction}
                    disabled={actionSubmitting}
                    style={{ background: '#3E4784', color: '#ffffff', border: 'none', padding: '0.5rem 1.25rem', borderRadius: '6px', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer' }}
                  >
                    {actionSubmitting ? 'Updating...' : 'Confirm: Take Up for Review'}
                  </button>
                </div>
              )}

              {actionType === 'clarify' && (
                <div style={{ background: '#FFFAEB', border: '1px solid #FEDF89', borderRadius: '8px', padding: '1rem', marginBottom: '1rem' }}>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#B54708', marginBottom: '0.35rem' }}>
                    Clarification Inquiries for Parent * (Mandatory)
                  </label>
                  <textarea
                    rows={2}
                    placeholder="e.g. Please confirm if school bus transport is required, or clarify previous school affiliation board."
                    value={clarificationMessage}
                    onChange={(e) => setClarificationMessage(e.target.value)}
                    style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: '6px', border: '1px solid #FEDF89', fontSize: '0.85rem', marginBottom: '0.75rem' }}
                  />
                  <button
                    onClick={handleExecuteAction}
                    disabled={actionSubmitting}
                    style={{ background: '#B54708', color: '#ffffff', border: 'none', padding: '0.5rem 1.25rem', borderRadius: '6px', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer' }}
                  >
                    {actionSubmitting ? 'Dispatching...' : 'Dispatch Clarification to Parent'}
                  </button>
                </div>
              )}

              {actionType === 'recommend' && (
                <div style={{ background: '#F0F9FF', border: '1px solid #B2DDFF', borderRadius: '8px', padding: '1rem', marginBottom: '1rem' }}>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#026AA2', marginBottom: '0.35rem' }}>
                    Official Staff Recommendation *
                  </label>
                  <select
                    value={recommendationDecision}
                    onChange={(e) => setRecommendationDecision(e.target.value)}
                    style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: '6px', border: '1px solid #B2DDFF', fontSize: '0.85rem', marginBottom: '0.75rem', background: '#FFFFFF' }}
                  >
                    <option value="recommend_approval">Recommend Stage 1 Approval</option>
                    <option value="recommend_rejection">Recommend Application Rejection</option>
                    <option value="request_clarification">Recommend Requesting Parent Clarification</option>
                  </select>

                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#026AA2', marginBottom: '0.35rem' }}>
                    Institutional Rationale & Evaluation Notes * (Mandatory)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Verified eligibility and standard capacity. Recommended for Stage 1 approval."
                    value={actionNotes}
                    onChange={(e) => setActionNotes(e.target.value)}
                    style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: '6px', border: '1px solid #B2DDFF', fontSize: '0.85rem', marginBottom: '0.75rem' }}
                  />

                  <button
                    onClick={handleExecuteAction}
                    disabled={actionSubmitting}
                    style={{ background: '#026AA2', color: '#ffffff', border: 'none', padding: '0.5rem 1.25rem', borderRadius: '6px', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer' }}
                  >
                    {actionSubmitting ? 'Submitting...' : 'Submit Recommendation to Administrator'}
                  </button>
                </div>
              )}

              {actionType === 'approve' && (
                <div style={{ background: '#ECFDF3', border: '1px solid #A6F4C5', borderRadius: '8px', padding: '1rem', marginBottom: '1rem' }}>
                  {permissions.can_approve_stage1 === false && (
                    <div style={{ background: '#FEF3F2', border: '1px solid #FECDCA', color: '#B42318', padding: '0.65rem', borderRadius: '6px', marginBottom: '0.75rem', fontSize: '0.825rem' }}>
                      ⚠️ <strong>Unauthorized:</strong> Your account does not have explicit Stage 1 approval authority (<code>can_approve_stage1</code>). Please use <strong>Recommend Decision to Admin</strong> to forward your recommendation.
                    </div>
                  )}
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#027A48', marginBottom: '0.35rem' }}>
                    Stage 1 Approval Note
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Preliminary eligibility verified. Eligible for Stage 2 submission."
                    value={actionNotes}
                    onChange={(e) => setActionNotes(e.target.value)}
                    style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: '6px', border: '1px solid #A6F4C5', fontSize: '0.85rem', marginBottom: '0.75rem' }}
                  />
                  <div style={{ fontSize: '0.8rem', color: '#027A48', marginBottom: '0.75rem' }}>
                    🛡️ Approving Stage 1 reserves the queue slot under official seat quotas. Official student/enrolment records are NOT created at this stage.
                  </div>
                  <button
                    onClick={handleExecuteAction}
                    disabled={actionSubmitting || permissions.can_approve_stage1 === false}
                    style={{
                      background: permissions.can_approve_stage1 === false ? '#98A2B3' : '#027A48',
                      color: '#ffffff',
                      border: 'none',
                      padding: '0.5rem 1.25rem',
                      borderRadius: '6px',
                      fontWeight: 700,
                      fontSize: '0.85rem',
                      cursor: permissions.can_approve_stage1 === false ? 'not-allowed' : 'pointer'
                    }}
                  >
                    {permissions.can_approve_stage1 === false ? 'Approval Restricted to Admin' : actionSubmitting ? 'Processing...' : 'Confirm Stage 1 Approval ✓'}
                  </button>
                </div>
              )}

              {actionType === 'reject' && (
                <div style={{ background: '#FEF3F2', border: '1px solid #FECDCA', borderRadius: '8px', padding: '1rem', marginBottom: '1rem' }}>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#B42318', marginBottom: '0.35rem' }}>
                    Official Rejection Rationale * (Mandatory Human Decision)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Applicant residence is outside statutory catchment zone."
                    value={rejectionReason}
                    onChange={(e) => setRejectionReason(e.target.value)}
                    style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: '6px', border: '1px solid #FECDCA', fontSize: '0.85rem', marginBottom: '0.75rem' }}
                  />

                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#B42318', marginBottom: '0.35rem' }}>
                    Further Explanation & Guidance for Parent
                  </label>
                  <textarea
                    rows={2}
                    placeholder="e.g. Please refer to jurisdictional cluster guidelines or contact the school office during working hours."
                    value={rejectionExplanation}
                    onChange={(e) => setRejectionExplanation(e.target.value)}
                    style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: '6px', border: '1px solid #FECDCA', fontSize: '0.85rem', marginBottom: '0.75rem' }}
                  />

                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#B42318', marginBottom: '0.35rem' }}>
                    Institution Inquiry Contact Phone
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 080-23341122"
                    value={institutionPhone}
                    onChange={(e) => setInstitutionPhone(e.target.value)}
                    style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: '6px', border: '1px solid #FECDCA', fontSize: '0.85rem', marginBottom: '0.75rem' }}
                  />

                  <button
                    onClick={handleExecuteAction}
                    disabled={actionSubmitting}
                    style={{ background: '#B42318', color: '#ffffff', border: 'none', padding: '0.5rem 1.25rem', borderRadius: '6px', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer' }}
                  >
                    {actionSubmitting ? 'Rejecting...' : 'Confirm Rejection With Official Notice'}
                  </button>
                </div>
              )}

              {actionType === 'complete_stage2' && (
                <div style={{ background: '#ECFEFF', border: '1px solid #A5F3FC', borderRadius: '8px', padding: '1rem', marginBottom: '1rem' }}>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#0E7090', marginBottom: '0.35rem' }}>
                    Stage 2 Verification Review Notes
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Verified date of birth, previous schooling marks, and mandatory transfer certificate."
                    value={actionNotes}
                    onChange={(e) => setActionNotes(e.target.value)}
                    style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: '6px', border: '1px solid #A5F3FC', fontSize: '0.85rem', marginBottom: '0.75rem' }}
                  />
                  <div style={{ fontSize: '0.8rem', color: '#0E7090', marginBottom: '0.75rem' }}>
                    🛡️ This confirms all required Stage 2 documents are verified. The applicant will be queued for Phase 6 Final Admission Confirmation & Student Enrolment.
                  </div>
                  <button
                    onClick={handleExecuteAction}
                    disabled={actionSubmitting}
                    style={{ background: '#0E7090', color: '#ffffff', border: 'none', padding: '0.5rem 1.25rem', borderRadius: '6px', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer' }}
                  >
                    {actionSubmitting ? 'Finalizing Review...' : 'Confirm: Complete Stage 2 Review ✓'}
                  </button>
                </div>
              )}

              {/* PHASE 6 FINAL ADMISSION & ENROLMENT ACTION PANEL */}
              {actionType === 'confirm_enrolment' && (
                <div style={{ background: '#FDF4FF', border: '1px solid #F5D0FE', borderRadius: '8px', padding: '1.25rem', marginBottom: '1rem' }}>
                  <h4 style={{ margin: '0 0 0.5rem 0', color: '#701A75', fontSize: '1rem', fontWeight: 800 }}>
                    🎓 Phase 6: Official Admission Confirmation & Student Enrolment
                  </h4>
                  <p style={{ margin: '0 0 1rem 0', fontSize: '0.85rem', color: '#86198F' }}>
                    Confirming admission generates a globally unique Permanent Student ID, creates official records in <code>students</code> and <code>enrollments</code>, and atomically updates section seat capacity.
                  </p>

                  {/* Payment Verification Status in Panel */}
                  {activeApp.payment_status === 'PAID_DEMO' ? (
                    <div style={{ background: '#ECFDF3', border: '1px solid #A6F4C5', borderRadius: '6px', padding: '0.65rem 0.85rem', marginBottom: '1rem', color: '#027A48', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span>✓</span>
                      <div>
                        <strong>Demo Payment Verified: PAID_DEMO</strong> (Ref: <code>{activeApp.payment_ref}</code>). Prerequisites satisfied for final enrollment.
                      </div>
                    </div>
                  ) : (
                    <div style={{ background: '#FEF3F2', border: '1px solid #FECDCA', borderRadius: '6px', padding: '0.75rem 1rem', marginBottom: '1rem', color: '#B42318', fontSize: '0.85rem' }}>
                      <strong>⚠️ Demo Payment Pending:</strong> This applicant has not yet completed the simulated demo fee payment (Status: <code>{activeApp.payment_status || 'PENDING'}</code>). The parent must click <strong>MARK AS PAID – DEMO</strong> in the Parent Dashboard before official school enrollment can proceed.
                    </div>
                  )}

                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#701A75', marginBottom: '0.35rem' }}>
                    Select Program Section Allotment *
                  </label>
                  {loadingSections ? (
                    <p style={{ fontSize: '0.85rem', color: '#64748B' }}>Loading section seat capacities...</p>
                  ) : availableSections.length === 0 ? (
                    <p style={{ fontSize: '0.85rem', color: '#B42318' }}>No active sections found for this standard/program.</p>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem', marginBottom: '1rem' }}>
                      {availableSections.map((sec) => (
                        <div
                          key={sec.section_id}
                          onClick={() => !sec.is_full && setSelectedSectionId(sec.section_id)}
                          style={{
                            border: `2px solid ${selectedSectionId === sec.section_id ? '#701A75' : '#E2E8F0'}`,
                            borderRadius: '8px',
                            padding: '0.75rem',
                            background: selectedSectionId === sec.section_id ? '#FAF5FF' : sec.is_full ? '#F1F5F9' : '#ffffff',
                            cursor: sec.is_full ? 'not-allowed' : 'pointer',
                            opacity: sec.is_full ? 0.6 : 1
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                            <strong style={{ fontSize: '0.95rem', color: '#102B46' }}>
                              Section {sec.section_name} (Std/Year {sec.term_or_year})
                            </strong>
                            {selectedSectionId === sec.section_id && <span style={{ color: '#701A75', fontWeight: 700 }}>✓ Selected</span>}
                          </div>
                          <div style={{ fontSize: '0.8rem', color: '#475569' }}>
                            Capacity: <strong>{sec.capacity}</strong> • Enrolled: <strong>{sec.current_strength}</strong>
                          </div>
                          <div style={{ fontSize: '0.8rem', marginTop: '0.25rem', fontWeight: 600, color: sec.is_full ? '#B42318' : '#027A48' }}>
                            {sec.is_full ? '❌ Full Capacity' : `✓ ${sec.available_seats} Seats Available`}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#701A75', marginBottom: '0.35rem' }}>
                    Staff Enrolment Notes / Allotment Order
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Merit quota seat allotment. All statutory admission criteria confirmed."
                    value={actionNotes}
                    onChange={(e) => setActionNotes(e.target.value)}
                    style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: '6px', border: '1px solid #F5D0FE', fontSize: '0.85rem', marginBottom: '1rem' }}
                  />

                  <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                    <button
                      onClick={handleExecuteAction}
                      disabled={actionSubmitting || !selectedSectionId || activeApp.payment_status !== 'PAID_DEMO'}
                      style={{
                        background: activeApp.payment_status !== 'PAID_DEMO' ? '#94A3B8' : '#701A75',
                        color: '#ffffff',
                        border: 'none',
                        padding: '0.6rem 1.5rem',
                        borderRadius: '6px',
                        fontWeight: 700,
                        fontSize: '0.9rem',
                        cursor: actionSubmitting || !selectedSectionId || activeApp.payment_status !== 'PAID_DEMO' ? 'not-allowed' : 'pointer'
                      }}
                    >
                      {activeApp.payment_status !== 'PAID_DEMO'
                        ? 'Payment Required (PAID_DEMO)'
                        : actionSubmitting
                        ? 'Enrolling Student...'
                        : 'Confirm Admission & Enrol Student ✓'}
                    </button>
                    <button
                      onClick={() => setActionType('none')}
                      style={{ background: 'transparent', border: 'none', color: '#64748B', cursor: 'pointer', fontSize: '0.85rem' }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* ACTION PANEL: ALLOT SEAT */}
              {actionType === 'allot_seat' && (
                <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: '8px', padding: '1.25rem', marginBottom: '1rem' }}>
                  <h4 style={{ margin: '0 0 0.5rem 0', color: '#166534', fontSize: '1rem', fontWeight: 800 }}>
                    🎟️ Allot Seat & Generate Canonical Student ID
                  </h4>
                  <p style={{ margin: '0 0 1rem 0', fontSize: '0.85rem', color: '#15803D' }}>
                    Allotting a seat reserves an official vacancy for Standard {activeApp.requested_standard}. This generates an official Student ID (e.g., SCH01125), generates a Permanent Student ID, creates the student record, and notifies the parent.
                  </p>

                  {activeApp.payment_status === 'PAID_DEMO' ? (
                    <div style={{ background: '#DCFCE7', border: '1px solid #86EFAC', borderRadius: '6px', padding: '0.65rem 0.85rem', marginBottom: '1rem', color: '#166534', fontSize: '0.85rem' }}>
                      ✓ <strong>Payment Confirmed (PAID_DEMO):</strong> Application is fully eligible for seat allotment.
                    </div>
                  ) : (
                    <div style={{ background: '#FEF3F2', border: '1px solid #FECDCA', borderRadius: '6px', padding: '0.75rem 1rem', marginBottom: '1rem', color: '#B42318', fontSize: '0.85rem' }}>
                      <strong>⚠️ Unpaid Application:</strong> Fee status is <code>{activeApp.payment_status || 'PENDING'}</code>. Seat allotment cannot proceed until the demo payment is marked as paid by the parent.
                    </div>
                  )}

                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#166534', marginBottom: '0.35rem' }}>
                    Allotment Notes (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Merit quota seat allotment. All criteria confirmed."
                    value={actionNotes}
                    onChange={(e) => setActionNotes(e.target.value)}
                    style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: '6px', border: '1px solid #86EFAC', fontSize: '0.85rem', marginBottom: '1rem' }}
                  />

                  <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                    <button
                      onClick={handleExecuteAction}
                      disabled={actionSubmitting || activeApp.payment_status !== 'PAID_DEMO'}
                      style={{
                        background: activeApp.payment_status !== 'PAID_DEMO' ? '#94A3B8' : '#027A48',
                        color: '#ffffff',
                        border: 'none',
                        padding: '0.6rem 1.5rem',
                        borderRadius: '6px',
                        fontWeight: 700,
                        fontSize: '0.9rem',
                        cursor: actionSubmitting || activeApp.payment_status !== 'PAID_DEMO' ? 'not-allowed' : 'pointer'
                      }}
                    >
                      {activeApp.payment_status !== 'PAID_DEMO' ? 'Payment Required' : actionSubmitting ? 'Allotting Seat...' : 'Confirm Seat Allotment & Generate ID ✓'}
                    </button>
                    <button
                      onClick={() => setActionType('none')}
                      style={{ background: 'transparent', border: 'none', color: '#64748B', cursor: 'pointer', fontSize: '0.85rem' }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* ACTION PANEL: ASSIGN CLASS */}
              {actionType === 'assign_class' && (
                <div style={{ background: '#FDF4FF', border: '1px solid #F5D0FE', borderRadius: '8px', padding: '1.25rem', marginBottom: '1rem' }}>
                  <h4 style={{ margin: '0 0 0.5rem 0', color: '#701A75', fontSize: '1rem', fontWeight: 800 }}>
                    👨‍🎓 Assign Class & Section (Standard {activeApp.requested_standard})
                  </h4>
                  <p style={{ margin: '0 0 1rem 0', fontSize: '0.85rem', color: '#86198F' }}>
                    Select an active section for Standard {activeApp.requested_standard}. This links the student to class rosters and attendance registers.
                  </p>

                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#701A75', marginBottom: '0.5rem' }}>
                    Select Section *
                  </label>
                  {loadingSections ? (
                    <p style={{ fontSize: '0.85rem', color: '#64748B' }}>Loading sections...</p>
                  ) : availableSections.length === 0 ? (
                    <p style={{ fontSize: '0.85rem', color: '#B42318' }}>No active sections found for Standard {activeApp.requested_standard}.</p>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem', marginBottom: '1rem' }}>
                      {availableSections.map((sec) => (
                        <div
                          key={sec.section_id}
                          onClick={() => !sec.is_full && setSelectedSectionId(sec.section_id)}
                          style={{
                            border: `2px solid ${selectedSectionId === sec.section_id ? '#701A75' : '#E2E8F0'}`,
                            borderRadius: '8px',
                            padding: '0.75rem',
                            background: selectedSectionId === sec.section_id ? '#FAF5FF' : sec.is_full ? '#F1F5F9' : '#ffffff',
                            cursor: sec.is_full ? 'not-allowed' : 'pointer',
                            opacity: sec.is_full ? 0.6 : 1
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                            <strong style={{ fontSize: '0.95rem', color: '#102B46' }}>
                              Section {sec.section_name}
                            </strong>
                            {selectedSectionId === sec.section_id && <span style={{ color: '#701A75', fontWeight: 700 }}>✓ Selected</span>}
                          </div>
                          <div style={{ fontSize: '0.78rem', color: '#475467' }}>
                            Strength: <strong>{sec.current_strength}</strong> / {sec.capacity}
                          </div>
                          <div style={{ fontSize: '0.78rem', marginTop: '0.25rem', fontWeight: 600, color: sec.is_full ? '#B42318' : '#027A48' }}>
                            {sec.is_full ? '❌ Full' : `✓ ${sec.available_seats} Available`}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#701A75', marginBottom: '0.35rem' }}>
                    Notes (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Standard 6 Section A allocation."
                    value={actionNotes}
                    onChange={(e) => setActionNotes(e.target.value)}
                    style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: '6px', border: '1px solid #F5D0FE', fontSize: '0.85rem', marginBottom: '1rem' }}
                  />

                  <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                    <button
                      onClick={handleExecuteAction}
                      disabled={actionSubmitting || !selectedSectionId}
                      style={{
                        background: !selectedSectionId ? '#94A3B8' : '#701A75',
                        color: '#ffffff',
                        border: 'none',
                        padding: '0.6rem 1.5rem',
                        borderRadius: '6px',
                        fontWeight: 700,
                        fontSize: '0.9rem',
                        cursor: actionSubmitting || !selectedSectionId ? 'not-allowed' : 'pointer'
                      }}
                    >
                      {actionSubmitting ? 'Enrolling...' : 'Confirm Class Assignment ✓'}
                    </button>
                    <button
                      onClick={() => setActionType('none')}
                      style={{ background: 'transparent', border: 'none', color: '#64748B', cursor: 'pointer', fontSize: '0.85rem' }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
