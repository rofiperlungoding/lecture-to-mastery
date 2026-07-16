import { usePressable } from "../hooks/usePressable";

export interface Tab {
  id: string
  label: string
  badge?: string | number
}

interface TabsProps {
  tabs: Tab[]
  activeTab: string
  onChange: (tabId: string) => void
  onHover?: (tabId: string) => void
}

// ------------------------------------------------------------------------
// TabButton — single tab item with press feedback
// Extracted as a named component to avoid rules-of-hooks issues from
// calling usePressable() inside .map().
// ------------------------------------------------------------------------

function TabButton({
  tab,
  active,
  onClick,
  onHover,
}: {
  tab: Tab
  active: boolean
  onClick: () => void
  onHover?: () => void
}) {
  const pressable = usePressable()

  return (
    <button
      role="tab"
      aria-selected={active}
      onClick={onClick}
      onMouseEnter={onHover}
      {...pressable}
      className={[
        'relative px-4 py-3 text-label whitespace-nowrap select-none cursor-pointer',
        'transition-colors duration-fast ease-out',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500',
        active ? 'text-text' : 'text-text-secondary hover:text-text',
      ].join(' ')}
    >
      <span className="flex items-center gap-1.5">
        {tab.label}
        {tab.badge !== undefined && (
          <span className={[
            'inline-flex items-center justify-center rounded-full px-1.5 py-0.5 text-caption font-semibold leading-none',
            'transition-colors duration-fast',
            active ? 'bg-brand-500 text-white' : 'bg-surface-muted text-text-tertiary',
          ].join(' ')}>
            {tab.badge}
          </span>
        )}
      </span>
      {/* Animated underline indicator */}
      <span
        className={[
          'absolute bottom-0 left-0 right-0 h-0.5 rounded-full',
          'transition-all duration-base ease-standard',
          active ? 'bg-brand-500 opacity-100' : 'bg-transparent opacity-0',
        ].join(' ')}
      />
    </button>
  )
}

// ------------------------------------------------------------------------
// Tabs — group of tab buttons
// ------------------------------------------------------------------------

export function Tabs({ tabs, activeTab, onChange, onHover }: TabsProps) {
  return (
    <div className="overflow-x-auto scrollbar-none" role="tablist">
      <div className="flex gap-0 min-w-max">
        {tabs.map((tab) => (
          <TabButton
            key={tab.id}
            tab={tab}
            active={activeTab === tab.id}
            onClick={() => onChange(tab.id)}
            onHover={onHover ? () => onHover(tab.id) : undefined}
          />
        ))}
      </div>
    </div>
  )
}
