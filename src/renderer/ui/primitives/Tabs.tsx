interface TabsProps<T extends string> {
  tabs: readonly { id: T; label: string }[]
  active: T
  onSelect: (id: T) => void
}

export function Tabs<T extends string>({ tabs, active, onSelect }: TabsProps<T>) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          className="tab"
          data-engaged={tab.id === active}
          aria-selected={tab.id === active}
          onClick={() => onSelect(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}
