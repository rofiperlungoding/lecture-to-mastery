export interface Tab {
  id: string
  label: string
}

interface TabsProps {
  tabs: Tab[]
  activeTab: string
  onChange: (tabId: string) => void
}

export function Tabs({ tabs, activeTab, onChange }: TabsProps) {
  return (
    <div className="border-b border-border">
      <div className="flex gap-0 -mb-px" role="tablist">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={activeTab === tab.id}
            onClick={() => onChange(tab.id)}
            className={`relative px-4 py-3 text-label transition-colors duration-150 ease-out ${
              activeTab === tab.id
                ? 'text-text'
                : 'text-text-secondary hover:text-text'
            }`}
          >
            {tab.label}
            {activeTab === tab.id && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-500" />
            )}
          </button>
        ))}
      </div>
    </div>
  )
}
