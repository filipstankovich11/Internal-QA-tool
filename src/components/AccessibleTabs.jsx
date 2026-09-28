import { useRef } from 'react'

/** Keyboard-operable tabs for compact task views. Panels stay mounted and use hidden. */
export default function AccessibleTabs({ tabs, value, onChange, idPrefix, label }) {
  const refs = useRef([])
  const move = (event, index) => {
    let next
    if (event.key === 'ArrowRight') next = (index + 1) % tabs.length
    else if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = tabs.length - 1
    else return
    event.preventDefault()
    onChange(tabs[next].id)
    refs.current[next]?.focus()
  }

  return <div role="tablist" aria-label={label} className="flex gap-1 overflow-x-auto rounded-xl p-1 mb-5" style={{ background: '#F1ECE8' }}>
    {tabs.map((tab, index) => {
      const active = value === tab.id
      return <button key={tab.id} ref={element => { refs.current[index] = element }} type="button" role="tab"
        id={`${idPrefix}-tab-${tab.id}`} aria-controls={`${idPrefix}-panel-${tab.id}`}
        aria-selected={active} tabIndex={active ? 0 : -1}
        onClick={() => onChange(tab.id)} onKeyDown={event => move(event, index)}
        className="shrink-0 rounded-lg px-4 py-2 text-sm font-medium transition-colors"
        style={{ background: active ? '#FFFFFF' : 'transparent', color: active ? '#1A1E23' : 'rgba(26,30,35,.72)',
          boxShadow: active ? '0 1px 3px rgba(0,0,0,.06)' : 'none' }}>
        {tab.label}
      </button>
    })}
  </div>
}
