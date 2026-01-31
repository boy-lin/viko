import { Search, Flame, Check, Clock } from "lucide-react"
import { useState } from "react"
import { Input } from "@/components/ui/input"
import { NewFeatures } from './NewFeatures'
import { RecentFilesList } from "./RecentFilesList"
import { useTranslation } from "react-i18next"
import { CommonFeatures } from "./CommonFeatures"
import { EmptyState } from "@/components/ui/empty-state"

const tabs = [
  {
    key: "new",
    label: "tabs.new",
    icon: Flame,
  },
  {
    key: "common",
    label: "tabs.common",
    icon: Check,
  },
  {
    key: "recent",
    label: "tabs.recent",
    icon: Clock,
  },
]

export function ToolsTab() {
  const [activeKey, setActiveKey] = useState(tabs[0].key)
  const { t } = useTranslation("home")

  const renderContainer = (key: string) => {
    switch (key) {
      case 'new':
        return <NewFeatures />
      case 'common':
        return <CommonFeatures />
      case 'recent':
        return <RecentFilesList />
      default:
        return <div className="grid grid-cols-3 gap-4 lg:grid-cols-4">
          <EmptyState />
        </div>
    }

  }
  return (
    <div className="space-y-6">
      {/* Tabs & Search */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-6">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              className={`relative cursor-pointer whitespace-nowrap flex items-center gap-2 pb-0 font-medium transition-colors ${activeKey === tab.key
                ? "text-indigo-600"
                : "text-muted-foreground hover:text-foreground"
                }`}
              onClick={() => setActiveKey(tab.key)}
            >
              {tab.icon && <tab.icon className="w-5 h-5" />}
              {t(tab.label)}
              <span
                className={`absolute left-1/2 -bottom-1 h-0.5 w-full -translate-x-1/2 rounded-full transition-all ${activeKey === tab.key
                  ? "opacity-100 bg-gradient-to-r from-[#8B5CF6] via-[#6366F1] to-[#3B82F6]"
                  : "opacity-0"
                  }`}
              />
            </button>
          ))}
        </div>
        <div className="relative w-80">
          <Search
            className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground`}
          />
          <Input
            placeholder={t("searchPlaceholder")}
            className={`pl-10 bg-white border-border placeholder:text-muted-foreground`}
          />
        </div>
      </div>

      {/* Tools Grid */}

      {renderContainer(activeKey)}
    </div>
  );
}
