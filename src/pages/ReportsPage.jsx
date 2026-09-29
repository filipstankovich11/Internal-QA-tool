import { useEffect, useMemo, useRef, useState } from 'react'
import { useApp } from '../context/AppContext'
import { VERDICT_COLOR, VERDICT_LABEL } from '../lib/verdict'
import { filterReportScores, latestScoresByTicket, questionRows, scorecardSummary } from '../lib/reportData'
import './ReportsPage.css'

const REPORTS = [
  { id: 'scorecard', label: 'Scorecard', title: 'Scorecard report', description: 'Overall quality, verdict mix, and team performance.' },
  { id: 'question', label: 'Questions', title: 'Question report', description: 'Which rubric questions consistently need attention.' },
  { id: 'dispute', label: 'Disputes', title: 'Dispute report', description: 'Open score disputes that need a reviewer decision.' },
]
const PERIODS = [
  { value: '7', label: 'Last 7 days' },
  { value: '30', label: 'Last 30 days' },
  { value: '90', label: 'Last 90 days' },
  { value: 'all', label: 'All loaded' },
]
const fmt = value => value == null ? '—' : value.toFixed(1)
const shortDate = value => Number.isFinite(value)
  ? new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '—'

function ReportIcon({ type }) {
  return <svg aria-hidden="true" width="27" height="27" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    {type === 'scorecard' && <><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h4"/></>}
    {type === 'question' && <><circle cx="12" cy="12" r="9"/><path d="M9.8 9a2.5 2.5 0 0 1 4.4 1.6c0 1.6-2.2 2-2.2 3.5M12 17.5h.01"/></>}
    {type === 'dispute' && <><path d="M5 4h14v12H9l-4 4V4Z"/><path d="M12 8v4M12 14h.01"/></>}
  </svg>
}

function ArrowIcon({ open = false }) {
  return <svg aria-hidden="true" className={`report-arrow${open ? ' is-open' : ''}`} width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 12h14M13 6l6 6-6 6"/>
  </svg>
}

function Stat({ label, value, sub, onClick, expanded = false }) {
  const Tag = onClick ? 'button' : 'div'
  return <Tag className={`report-stat${onClick ? ' report-stat-button' : ''}${expanded ? ' is-active' : ''}`}
    {...(onClick ? { type: 'button', onClick, 'aria-expanded': expanded, 'aria-controls': 'report-ticket-results' } : {})}>
    <strong>{value}</strong>
    <span>{label}</span>
    {sub && <small>{sub}</small>}
    {onClick && <small className="report-stat-action">View tickets <ArrowIcon /></small>}
  </Tag>
}

function Empty({ title, detail }) {
  return <div className="report-empty"><h3>{title}</h3><p>{detail}</p></div>
}

const TICKET_PAGE_SIZE = 10

function TicketDrilldown({ title, scores, onOpen, onClose }) {
  const [visibleCount, setVisibleCount] = useState(TICKET_PAGE_SIZE)
  const visible = scores.slice(0, visibleCount)
  const remaining = scores.length - visible.length

  return <section id="report-ticket-results" className="report-ticket-results" aria-labelledby="report-ticket-results-title">
    <div className="report-ticket-results-heading">
      <div>
        <h3 id="report-ticket-results-title">{title}</h3>
        <p>{scores.length} {scores.length === 1 ? 'ticket' : 'tickets'} in the current report selection.</p>
      </div>
      <button type="button" className="report-ticket-close" onClick={onClose} aria-label="Close ticket list">
        <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="m6 6 12 12M18 6 6 18"/></svg>
        Close
      </button>
    </div>
    <div className="report-ticket-list">
      {visible.map(score => {
        const verdict = VERDICT_LABEL[score.effectiveVerdict] || score.effectiveVerdict || 'Unrated'
        const subject = score.fullScore?.ticket_subject || 'No ticket subject'
        return <button key={score.id} type="button" className="report-ticket-row" onClick={() => onOpen(score)}
          aria-label={`Open ticket ${score.ticketId}, ${verdict}, score ${fmt(score.effectiveScore)} out of 100`}>
          <span className="report-ticket-name"><strong>Ticket #{score.ticketId}</strong><small>{subject}</small></span>
          <span className="report-ticket-meta">
            <span className="report-ticket-verdict" style={{ color: VERDICT_COLOR[score.effectiveVerdict] || 'var(--ink-60)' }}>{verdict}</span>
            <strong>{fmt(score.effectiveScore)}</strong>
            <small>{shortDate(score.scoredAt)}</small>
            <ArrowIcon />
          </span>
        </button>
      })}
    </div>
    {remaining > 0 && <button type="button" className="report-ticket-more" onClick={() => setVisibleCount(count => count + TICKET_PAGE_SIZE)}>
      Show {Math.min(TICKET_PAGE_SIZE, remaining)} more <span>{remaining} remaining</span>
    </button>}
  </section>
}

export function ReportsView({ scoreHistory, agents, teams, rubric, dataLoading, openScore, reportsState, setReportsState }) {
  const { report, period, teamId, selectedQuestion, ticketSelection } = reportsState
  const ticketViewRef = useRef(null)
  const updateReportsState = patch => setReportsState(current => ({ ...current, ...patch }))
  const setReport = value => updateReportsState({ report: value, ticketSelection: null })
  const setPeriod = value => updateReportsState({ period: value, ticketSelection: null })
  const setTeamId = value => updateReportsState({ teamId: value, ticketSelection: null })
  const setSelectedQuestion = value => setReportsState(current => ({
    ...current,
    selectedQuestion: typeof value === 'function' ? value(current.selectedQuestion) : value,
  }))

  const latestScores = useMemo(() => latestScoresByTicket(scoreHistory), [scoreHistory])
  const selectedScores = useMemo(() => filterReportScores(latestScores, agents, { days: period, teamId }), [latestScores, agents, period, teamId])
  const summary = useMemo(() => scorecardSummary(selectedScores), [selectedScores])
  const questions = useMemo(() => questionRows(selectedScores, rubric), [selectedScores, rubric])
  const disputes = useMemo(() => filterReportScores(scoreHistory.filter(score => score.disputed), agents,
    { days: period, teamId, dateField: 'disputeAt' }).sort((a, b) => (a.disputeAt || 0) - (b.disputeAt || 0)),
    [scoreHistory, agents, period, teamId])
  const teamRows = useMemo(() => teams.map(team => {
    const rows = filterReportScores(selectedScores, agents, { days: 'all', teamId: team.id })
    return { team, scores: rows, ...scorecardSummary(rows) }
  }).filter(row => row.count > 0).sort((a, b) => b.count - a.count), [teams, selectedScores, agents])
  const selectedQuestionRow = questions.find(row => row.id === selectedQuestion && row.count > 0)
  const questionEvidence = selectedQuestionRow ? selectedScores.map(score => {
    const raw = score.fullScore?.scores?.[selectedQuestionRow.dimensionId]?.[selectedQuestionRow.criterionId]?.score
    return { score, rating: raw == null ? null : Number(raw) }
  }).filter(item => item.rating !== null && Number.isFinite(item.rating))
    .sort((a, b) => a.rating - b.rating || b.score.scoredAt - a.score.scoredAt).slice(0, 5) : []
  const questionCount = questions.filter(row => row.count > 0).length
  const reportCounts = {
    scorecard: dataLoading ? 'Loading' : `${summary.count} ${summary.count === 1 ? 'ticket' : 'tickets'}`,
    question: dataLoading ? 'Loading' : `${questionCount} ${questionCount === 1 ? 'question' : 'questions'}`,
    dispute: dataLoading ? 'Loading' : `${disputes.length} open`,
  }
  const scoresById = useMemo(() => new Map(scoreHistory.map(score => [score.id, score])), [scoreHistory])
  const ticketView = useMemo(() => ticketSelection ? {
    ...ticketSelection,
    scores: ticketSelection.scoreIds.map(id => scoresById.get(id)).filter(Boolean),
  } : null, [ticketSelection, scoresById])

  const openTicket = score => openScore({
    ...score.fullScore, scoreId: score.id, reviewerNote: score.notes,
    overrideVerdict: score.overrideVerdict, overrideScore: score.overrideScore,
    overrideNote: score.overrideNote, overrideAt: score.overrideAt,
    disputed: score.disputed, disputeNote: score.disputeNote, disputeAt: score.disputeAt,
    acknowledged: score.acknowledged, acknowledgedAt: score.acknowledgedAt,
  })

  const showTickets = (key, title, scores) => updateReportsState({
    ticketSelection: {
      key,
      title,
      scoreIds: [...scores].sort((a, b) => (b.scoredAt || 0) - (a.scoredAt || 0)).map(score => score.id),
    },
  })

  const scoresForQuestion = (row, lowOnly = false) => selectedScores.filter(score => {
    const raw = score.fullScore?.scores?.[row.dimensionId]?.[row.criterionId]?.score
    const rating = raw == null ? null : Number(raw)
    return Number.isFinite(rating) && (!lowOnly || rating <= 2)
  })

  useEffect(() => {
    if (!ticketView) return undefined
    const frame = requestAnimationFrame(() => ticketViewRef.current?.scrollIntoView({
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
      block: 'start',
    }))
    return () => cancelAnimationFrame(frame)
  }, [ticketView])

  return <main className="reports-page">
    <header className="reports-header">
      <div><h1>Reports</h1><p>Explore QA results and the tickets behind them.</p>
        <p className="report-scope"><svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></svg>Based on up to 500 recently loaded score records.</p></div>
      <div className="reports-filters">
        <label>Time period<select value={period} onChange={event => setPeriod(event.target.value)}>
          {PERIODS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select></label>
        <label>Team<select value={teamId} onChange={event => setTeamId(event.target.value)}>
          <option value="all">All teams</option>
          {teams.map(team => <option key={team.id} value={team.id}>{team.name}</option>)}
        </select></label>
      </div>
    </header>

    <div className="report-choices" aria-label="Report type">
      {REPORTS.map(item => <button key={item.id} type="button" onClick={() => setReport(item.id)}
        className={`report-choice ${report === item.id ? 'is-selected' : ''}`}
        aria-pressed={report === item.id}>
        <span className="report-choice-icon"><ReportIcon type={item.id} /></span>
        <span className="report-choice-copy"><strong>{item.label}</strong><small>{item.description}</small></span>
        <span className="report-choice-meta">{reportCounts[item.id]}</span>
      </button>)}
    </div>

    <section className="report-content" aria-busy={dataLoading}>
      <div key={`${report}-${period}-${teamId}`} className="report-sheet">
      <div className="report-content-heading">
        <div><h2>{REPORTS.find(item => item.id === report).title}</h2>
          <p>{report === 'dispute' ? 'Filtered by dispute date.' : 'Filtered by score date. Latest score per ticket.'}</p></div>
        <span className="report-period-label">{PERIODS.find(item => item.value === period).label}</span>
      </div>

      {dataLoading ? <Empty title="Loading reports" detail="Gathering the latest scores and disputes." /> : <>
        {report === 'scorecard' && (summary.count === 0
          ? <Empty title="No scored tickets in this view" detail="Try a longer time period or another team." />
          : <>
            <div className="report-stats">
              <Stat label="Scored tickets" value={summary.count}
                onClick={() => showTickets('scorecard-all', 'Scored tickets', selectedScores)}
                expanded={ticketView?.key === 'scorecard-all'} />
              <Stat label="Average score" value={fmt(summary.average)} sub="out of 100" />
              <Stat label="Pass rate" value={`${Math.round(summary.passRate)}%`} sub={`${summary.verdicts.PASS} passing tickets`}
                onClick={summary.verdicts.PASS ? () => showTickets('scorecard-pass', 'Passing tickets', selectedScores.filter(score => score.effectiveVerdict === 'PASS')) : undefined}
                expanded={ticketView?.key === 'scorecard-pass'} />
            </div>
            <div className="report-block"><h3>Verdict distribution</h3>
              <div className="report-verdicts">{['PASS', 'NEEDS_REVIEW', 'FAIL'].map(verdict => {
                const count = summary.verdicts[verdict]
                const viewKey = `verdict-${verdict}`
                return <button type="button" className={`report-verdict${ticketView?.key === viewKey ? ' is-active' : ''}`} key={verdict}
                  onClick={() => showTickets(viewKey, `${VERDICT_LABEL[verdict]} tickets`, selectedScores.filter(score => score.effectiveVerdict === verdict))}
                  disabled={!count} aria-expanded={ticketView?.key === viewKey} aria-controls="report-ticket-results">
                  <div><span>{VERDICT_LABEL[verdict]}</span><strong>{count} <small>· {Math.round(count / summary.count * 100)}%</small></strong></div>
                  <div className="report-bar"><span style={{ width: `${count / summary.count * 100}%`, background: VERDICT_COLOR[verdict] }} /></div>
                </button>
              })}</div>
            </div>
            <div className="report-block"><h3>By team</h3>
              {teamRows.length ? <><div className="report-table-wrap"><table className="report-table report-team-table"><thead><tr><th>Team</th><th>Tickets</th><th>Avg score</th><th>Pass rate</th></tr></thead>
                <tbody>{teamRows.map(row => {
                  const viewKey = `team-${row.team.id}`
                  return <tr key={row.team.id}><th scope="row"><button type="button" className="report-row-link" onClick={() => setTeamId(String(row.team.id))} aria-label={`Filter reports to ${row.team.name}`}>{row.team.name} <ArrowIcon /></button></th>
                    <td data-label="Tickets"><button type="button" className="report-count-link" onClick={() => showTickets(viewKey, `${row.team.name} tickets`, row.scores)} aria-expanded={ticketView?.key === viewKey} aria-controls="report-ticket-results">{row.count}</button></td>
                    <td data-label="Avg score">{fmt(row.average)}</td><td data-label="Pass rate">{Math.round(row.passRate)}%</td></tr>
                })}</tbody></table></div>
                <p className="report-note">A ticket linked to agents on multiple teams can appear in more than one team row.</p></>
                : <p className="report-note">No team-linked tickets in this selection.</p>}
            </div>
          </>)}

        {report === 'question' && (questions.every(row => row.count === 0)
          ? <Empty title="No question scores in this view" detail="Choose another period or team. Questions appear when scored tickets contain rubric ratings." />
          : <div className="report-block"><div className="report-block-heading"><h3>Rubric questions</h3><p>Lower averages appear first. Each row shows how many tickets had a rating for that question.</p></div>
            <div className="report-table-wrap"><table className="report-table report-question-table"><thead><tr><th>Question</th><th>Section</th><th>Rated</th><th>Avg / 5</th><th>Rated 1–2</th></tr></thead>
              <tbody>{[...questions].filter(row => row.count).sort((a, b) => a.average - b.average).map(row => {
                const ratedKey = `question-${row.id}-rated`
                const lowKey = `question-${row.id}-low`
                return <tr key={row.id} className={selectedQuestion === row.id ? 'is-expanded' : ''}>
                  <th scope="row"><button type="button" className="report-row-link" onClick={() => setSelectedQuestion(current => current === row.id ? null : row.id)} aria-expanded={selectedQuestion === row.id} aria-controls={selectedQuestion === row.id ? 'report-question-evidence' : undefined}>{row.name} <ArrowIcon open={selectedQuestion === row.id} /></button></th><td data-label="Section">{row.dimension}</td>
                  <td data-label="Rated"><button type="button" className="report-count-link" onClick={() => showTickets(ratedKey, `${row.name} · rated tickets`, scoresForQuestion(row))} aria-expanded={ticketView?.key === ratedKey} aria-controls="report-ticket-results">{row.count}</button></td>
                  <td data-label="Avg / 5"><strong className={row.average <= 2.5 ? 'report-low' : ''}>{fmt(row.average)}</strong></td>
                  <td data-label="Rated 1–2">{row.belowStandard ? <button type="button" className="report-count-link" onClick={() => showTickets(lowKey, `${row.name} · rated 1–2`, scoresForQuestion(row, true))} aria-expanded={ticketView?.key === lowKey} aria-controls="report-ticket-results">{row.belowStandard}</button> : 0}</td>
                </tr>
              })}</tbody></table></div>
            {selectedQuestionRow && <div id="report-question-evidence" className="report-evidence">
              <h4>Lowest rated tickets · {selectedQuestionRow.name}</h4>
              <div>{questionEvidence.map(({ score, rating }) => <button key={score.id} type="button" onClick={() => openTicket(score)}>
                <span>Ticket #{score.ticketId}</span><span>{rating}/5 <ArrowIcon /></span>
              </button>)}</div>
            </div>}
            <p className="report-note">Questions added to the current rubric may have fewer historical ratings.</p>
          </div>)}

        {report === 'dispute' && <>
          <div className="report-stats report-stats-single"><Stat label="Open disputes" value={disputes.length} sub="Current unresolved cases"
            onClick={disputes.length ? () => showTickets('disputes-open', 'Open dispute tickets', disputes) : undefined}
            expanded={ticketView?.key === 'disputes-open'} /></div>
          {disputes.length === 0 ? <Empty title="No open disputes in this view" detail="Try a longer time period or another team." />
            : <div className="report-block"><div className="report-block-heading"><h3>Cases needing review</h3><p>Oldest disputes first.</p></div>
              <div className="report-disputes">{disputes.map(score => <article key={score.id} className="report-dispute">
                <div><strong>Ticket #{score.ticketId}</strong><span>{shortDate(score.disputeAt)}</span></div>
                <p>{score.disputeNote || 'No reason was provided.'}</p>
                <button type="button" onClick={() => openTicket(score)} aria-label={`Open disputed ticket ${score.ticketId}`}>Open scored ticket <ArrowIcon /></button>
              </article>)}</div>
            </div>}
          <p className="report-note">Resolved dispute history is not stored yet, so this report shows open cases within the loaded scores only.</p>
        </>}
      </>}
      {ticketView && <div ref={ticketViewRef}><TicketDrilldown key={ticketView.key} title={ticketView.title} scores={ticketView.scores} onOpen={openTicket} onClose={() => updateReportsState({ ticketSelection: null })} /></div>}
      </div>
    </section>
  </main>
}

export default function ReportsPage() {
  return <ReportsView {...useApp()} />
}
