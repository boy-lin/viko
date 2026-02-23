import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { MenuItems } from "@/layout/sidebar/menu"
import { Link } from "react-router-dom"
import { useTranslation } from "react-i18next"

const tools = [
  {
    id: 2,
    title: "newFeatures.videoMeta.title",
    description: "newFeatures.videoMeta.desc",
    image: "/cover/2.jpg",
    badge: "",
    icon: "Metadata",
    ai: false,
    href: MenuItems.metadata,
  },
  {
    id: 3,
    title: "newFeatures.audioMeta.title",
    description: "newFeatures.audioMeta.desc",
    image: "/cover/3.jpg",
    //badge: "Hot",
    icon: "Metadata",
    ai: false,
    href: MenuItems.metadata,
  },
  {
    id: 4,
    title: "newFeatures.imageMeta.title",
    description: "newFeatures.imageMeta.desc",
    image: "/cover/1.jpg",
    icon: "Metadata",
    ai: false,
    disabled: true,
  },
  {
    id: 5,
    title: "newFeatures.merge.title",
    description: "newFeatures.merge.desc",
    image: "/cover/4.jpg",
    icon: "Merger",
    disabled: true,
    future: true,
  },
  {
    id: 6,
    title: "newFeatures.split.title",
    description: "newFeatures.split.desc",
    image: "/cover/5.jpg",
    icon: "Splitter",
    disabled: true,
    future: true,
  },
  {
    id: 7,
    title: "newFeatures.crop.title",
    description: "newFeatures.crop.desc",
    image: "/cover/6.jpg",
    icon: "Cropper",
    disabled: true,
    future: true,
  },
  {
    id: 8,
    title: "newFeatures.rotate.title",
    description: "newFeatures.rotate.desc",
    image: "/cover/7.jpg",
    icon: "Rotator",
    disabled: true,
    future: true,
  },
]
export const NewFeatures = () => {
  const { t } = useTranslation("home")
  return <div className="grid grid-cols-3 gap-4 lg:grid-cols-4">
    {tools.map((tool) => {
      const content = (
        <Card
          key={tool.id}
          className={`group hover:shadow-lg transition-shadow overflow-hidden bg-background border-border py-0 gap-0 ${tool.disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}
        >
          <div className="relative">
            <img
              src={tool.image || "/placeholder.svg"}
              alt={t(tool.title)}
              className="w-full h-40 object-cover"
            />
            {tool.badge && (
              <Badge className="absolute top-2 right-2 bg-gradient-to-r from-[#F43F5E] to-[#F97316] text-background border-none px-2.5 py-1 rounded-full shadow-sm">
                {tool.badge}
              </Badge>
            )}
            {tool.future && (
              <div className="absolute top-2 left-2 bg-foreground/70 text-background text-xs px-2 py-1 rounded-full">
                {t("comingSoon")}
              </div>
            )}
            {/* {tool.icon && (
              <div className="absolute inset-0 flex items-center justify-center text-background text-2xl font-bold">
                {tool.icon}
              </div>
            )} */}
          </div>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <h3 className={`font-semibold text-foreground`}>{t(tool.title)}</h3>
              {tool.ai && <Badge className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs border-none">AI</Badge>}
            </div>
            <p className={`text-sm text-muted-foreground`}>{t(tool.description)}</p>
          </CardContent>
        </Card>
      )

      if (tool.href && !tool.disabled) {
        return (
          <Link key={tool.id} to={tool.href} className="block">
            {content}
          </Link>
        )
      }

      return (
        <div key={tool.id} className="group relative">
          <div className="absolute inset-0 z-10 cursor-not-allowed" />
          {content}
        </div>
      )
    })}
  </div>
}
