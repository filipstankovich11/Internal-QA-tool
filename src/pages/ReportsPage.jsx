import { useMemo, useState } from 'react'
import { useApp } from '../context/AppContext'
import { VERDICT_COLOR, VERDICT_LABEL } from '../lib/verdict'
import { filterReportScores, latestScoresByTicket, questionRows, scorecardSummary } from '../lib/reportData'
import './ReportsPage.css'

const REPORTS = [
  { id: 'scorecard', title: 'Scorecard report', description: 'Overall quality, verdict mix, and team performance.' },
  { id: 'question', title: 'Question report', description: 'Which rubric questions consistently need attention.' },
  { id: 'dispute', title: 'Dispute report', description: 'Open score disputes that need a reviewer decision.' },
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

function Stat({ label, value, sub }) {
  return <div className="report-stat">
    <strong>{value}</strong>
    <span>{label}</span>
    {sub && <small>{sub}</small>}
  </div>
}

function Empty({ title, detail }) {
  return <div className="report-empty"><h3>{title}</h3><p>{detail}</p></div>
}

export function ReportsView({ scoreHistory, agents, teams, rubric, dataLoading, openScore }) {
  const [report, setReport] = useState('scorecard')
  const [period, setPeriod] = useState('30')
  const [teamId, setTeamId] = useState('all')
  const [selectedQuestion, setSelectedQuestion] = useState(null)

  const latestScores = useMemo(() => latestScoresByTicket(scoreHistory), [scoreHistory])
  const selectedScores = useMemo(() => filterReportScores(latestScores, agents, { days: period, teamId }), [latestScores, agents, period, teamId])
  const summary = useMemo(() => scorecardSummary(selectedScores), [selectedScores])
  const questions = useMemo(() => questionRows(selectedScores, rubric), [selectedScores, rubric])
  const disputes = useMemo(() => filterReportScores(scoreHistory.filter(score => score.disputed), agents,
    { days: period, teamId, dateField: 'disputeAt' }).sort((a, b) => (a.disputeAt || 0) - (b.disputeAt || 0)),
    [scoreHistory, agents, period, teamId])
  const teamRows = useMemo(() => teams.map(team => {
    const rows = filterReportScores(selectedScores, agents, { days: 'all', teamId: team.id })
    return { team, ...scorecardSummary(rows) }
  }).filter(row => row.count > 0).sort((a, b) => b.count - a.count), [teams, selectedScores, agents])
  const selectedQuestionRow = questions.find(row => row.id === selectedQuestion && row.count > 0)
  const questionEvidence = selectedQuestionRow ? selectedScores.map(score => {
    const raw = score.fullScore?.scores?.[selectedQuestionRow.dimensionId]?.[selectedQuestionRow.criterionId]?.score
    return { score, rating: raw == null ? null : Number(raw) }
  }).filter(item => item.rating !== null && Number.isFinite(item.rating))
    .sort((a, b) => a.rating - b.rating || b.score.scoredAt - a.score.scoredAt).slice(0, 5) : []

  const openTicket = score => openScore({
    ...score.fullScore, scoreId: score.id, reviewerNote: score.notes,
    overrideVerdict: score.overrideVerdict, overrideScore: score.overrideScore,
    overrideNote: score.overrideNote, overrideAt: score.overrideAt,
    disputed: score.disputed, disputeNote: score.disputeNote, disputeAt: score.disputeAt,
    acknowledged: score.acknowledged, acknowledgedAt: score.acknowledgedAt,
  })

  return <main className="reports-page">
    <header className="reports-header">
      <div><h1>Reports</h1><p>Explore QA results and the tickets behind them.</p>
        <p className="report-scope">Based on up to 500 recently loaded score records.</p></div>
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
        <span className="report-choice-copy"><strong>{item.title}</strong><small>{item.description}</small></span>
        <span className="report-choice-arrow" aria-hidden="true">→</span>
      </button>)}
    </div>

    <section className="report-content" aria-busy={dataLoading}>
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
              <Stat label="Scored tickets" value={summary.count} />
              <Stat label="Average score" value={fmt(summary.average)} sub="out of 100" />
              <Stat label="Pass rate" value={`${Math.round(summary.passRate)}%`} />
            </div>
            <div className="report-block"><h3>Verdict distribution</h3>
              <div className="report-verdicts">{['PASS', 'NEEDS_REVIEW', 'FAIL'].map(verdict => {
                const count = summary.verdicts[verdict]
                return <div className="report-verdict" key={verdict}>
                  <div><span>{VERDICT_LABEL[verdict]}</span><strong>{count} <small>· {Math.round(count / summary.count * 100)}%</small></strong></div>
                  <div className="report-bar"><span style={{ width: `${count / summary.count * 100}%`, background: VERDICT_COLOR[verdict] }} /></div>
                </div>
              })}</div>
            </div>
            <div className="report-block"><h3>By team</h3>
              {teamRows.length ? <><div className="report-table-wrap"><table className="report-table"><thead><tr><th>Team</th><th>Tickets</th><th>Avg score</th><th>Pass rate</th></tr></thead>
                <tbody>{teamRows.map(row => <tr key={row.team.id}><th scope="row"><button type="button" className="report-row-link" onClick={() => setTeamId(String(row.team.id))} aria-label={`Filter reports to ${row.team.name}`}>{row.team.name} <span aria-hidden="true">→</span></button></th><td>{row.count}</td><td>{fmt(row.average)}</td><td>{Math.round(row.passRate)}%</td></tr>)}</tbody></table></div>
                <p className="report-note">A ticket linked to agents on multiple teams can appear in more than one team row.</p></>
                : <p className="report-note">No team-linked tickets in this selection.</p>}
            </div>
          </>)}

        {report === 'question' && (questions.every(row => row.count === 0)
          ? <Empty title="No question scores in this view" detail="Choose another period or team. Questions appear when scored tickets contain rubric ratings." />
          : <div className="report-block"><div className="report-block-heading"><h3>Rubric questions</h3><p>Lower averages appear first. Each row shows how many tickets had a rating for that question.</p></div>
            <div className="report-table-wrap"><table className="report-table"><thead><tr><th>Question</th><th>Section</th><th>Rated</th><th>Avg / 5</th><th>Rated 1–2</th></tr></thead>
              <tbody>{[...questions].filter(row => row.count).sort((a, b) => a.average - b.average).map(row => <tr key={row.id}>
                <th scope="row"><button type="button" className="report-row-link" onClick={() => setSelectedQuestion(current => current === row.id ? null : row.id)} aria-expanded={selectedQuestion === row.id} aria-controls={selectedQuestion === row.id ? 'report-question-evidence' : undefined}>{row.name} <span aria-hidden="true">→</span></button></th><td>{row.dimension}</td><td>{row.count}</td>
                <td><strong className={row.average <= 2.5 ? 'report-low' : ''}>{fmt(row.average)}</strong></td><td>{row.belowStandard}</td>
              </tr>)}</tbody></table></div>
            {selectedQuestionRow && <div id="report-question-evidence" className="report-evidence">
              <h4>Lowest rated tickets · {selectedQuestionRow.name}</h4>
              <div>{questionEvidence.map(({ score, rating }) => <button key={score.id} type="button" onClick={() => openTicket(score)}>
                <span>Ticket #{score.ticketId}</span><span>{rating}/5 <span aria-hidden="true">→</span></span>
              </button>)}</div>
            </div>}
            <p className="report-note">Questions added to the current rubric may have fewer historical ratings.</p>
          </div>)}

        {report === 'dispute' && <>
          <div className="report-stats report-stats-single"><Stat label="Open disputes" value={disputes.length} sub="Current unresolved cases" /></div>
          {disputes.length === 0 ? <Empty title="No open disputes in this view" detail="Try a longer time period or another team." />
            : <div className="report-block"><div className="report-block-heading"><h3>Cases needing review</h3><p>Oldest disputes first.</p></div>
              <div className="report-disputes">{disputes.map(score => <article key={score.id} className="report-dispute">
                <div><strong>Ticket #{score.ticketId}</strong><span>{shortDate(score.disputeAt)}</span></div>
                <p>{score.disputeNote || 'No reason was provided.'}</p>
                <button type="button" onClick={() => openTicket(score)} aria-label={`Open disputed ticket ${score.ticketId}`}>Open scored ticket <span aria-hidden="true">→</span></button>
              </article>)}</div>
            </div>}
          <p className="report-note">Resolved dispute history is not stored yet, so this report shows open cases within the loaded scores only.</p>
        </>}
      </>}
    </section>
  </main>
}

export default function ReportsPage() {
  return <ReportsView {...useApp()} />
}
