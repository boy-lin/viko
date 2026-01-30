import {
  Search,
  Flame,
} from "lucide-react"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"

const tabs = [
  {
    key: "new",
    label: "新功能",
    icon: Flame,
    active: true,
  },
  {
    key: "video",
    label: "Video",
  },
  {
    key: "common",
    label: "常用功能",
  },
  {
    key: "recent",
    label: "最近文件",
  },
]

const tools = [
  {
    id: 1,
    title: "Compressor",
    description: "Batch compress video and audio files without quality loss.",
    image: "/mountain-peak-sunset.jpg",
    badge: "New",
    icon: "200M → 20M",
  },
  {
    id: 2,
    title: "Screen Recorder",
    description: "1:1 quality screen recorder with lots of options.",
    image: "/purple-mountain-landscape.jpg",
    badge: "New",
    icon: "⏺",
  },
  {
    id: 3,
    title: "Video Enhancer",
    description: "Automatically enhance videos for clearer quality with fluid motions.",
    image: "/pink-mountain-sunset.jpg",
    badge: "New",
    ai: true,
  },
  {
    id: 4,
    title: "Video Editor",
    description: "Batch trim, crop, speed and add watermarks to videos.",
    image: "/mountain-landscape-blue-sky.jpg",
    badge: "New",
  },
  {
    id: 5,
    title: "Subtitle Editor",
    description: "Automatically generate, translate, and edit subtitles with ease.",
    image: "/ocean-sunset-beach.png",
    badge: "New",
    ai: true,
  },
  {
    id: 6,
    title: "Merger",
    description: "Merge multiple video or audio files into one.",
    image: "/orange-mountain-landscape.jpg",
    badge: null,
  },
  {
    id: 7,
    title: "Cutter",
    description: "Precisely trim, split, and delete video and audio segments.",
    image: "/pink-mountain-night.jpg",
    badge: null,
  },
  {
    id: 8,
    title: "Speech-to-Text",
    description: "Batch convert video or audio files to text.",
    image: "/ocean-beach-sunset.png",
    badge: "New",
    ai: true,
  },
]


export function ToolsTab() {
  return (
    <div>
      {/* Tabs & Search */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-6">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              className={`flex items-center gap-2 pb-2 font-medium ${
                tab.active
                  ? "border-b-2 border-purple-600 text-purple-600"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.icon && <tab.icon className="w-5 h-5" />}
              {tab.label}
            </button>
          ))}
        </div>
        <div className="relative w-80">
          <Search
            className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground`}
          />
          <Input
            placeholder="Search features by name or keyword"
            className={`pl-10 bg-background border-border placeholder:text-muted-foreground`}
          />
        </div>
      </div>

      {/* Tools Grid */}
      <div className="grid grid-cols-4 gap-4">
        {tools.map((tool) => (
          <Card
            key={tool.id}
            className={`group hover:shadow-lg transition-shadow cursor-pointer overflow-hidden bg-background border-border`}
          >
            <div className="relative">
              <img
                src={tool.image || "/placeholder.svg"}
                alt={tool.title}
                className="w-full h-40 object-cover"
              />
              {tool.badge && (
                <Badge className="absolute top-2 right-2 bg-orange-500 hover:bg-orange-600 text-white">
                  {tool.badge}
                </Badge>
              )}
              {tool.icon && (
                <div className="absolute inset-0 flex items-center justify-center text-white text-2xl font-bold">
                  {tool.icon}
                </div>
              )}
            </div>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                  <h3 className={`font-semibold text-foreground`}>{tool.title}</h3>
                {tool.ai && <Badge className="bg-purple-600 hover:bg-purple-700 text-white text-xs">AI</Badge>}
              </div>
              <p className={`text-sm text-muted-foreground`}>{tool.description}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}