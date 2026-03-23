import { Card, CardContent } from "@/components/ui/card";
import { HOME_COMMON_FEATURES, type HomeCommonFeature } from "@/config/navigation";
import { useAppStore } from "@/stores/app";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

export const CommonFeatures = () => {
  const { t } = useTranslation("home");
  const usageCounts = useAppStore((s) => s.usageCounts);

  const orderedByUsage = Object.entries(usageCounts || {})
    .map(([path, count]) => ({ path, count }))
    .sort((a, b) => b.count - a.count)
    .map((u) => HOME_COMMON_FEATURES.find((f) => f.path === u.path))
    .filter(Boolean) as HomeCommonFeature[];

  const remaining = HOME_COMMON_FEATURES.filter(
    (f) => !orderedByUsage.some((u) => u.id === f.id)
  );

  const finalList = [...orderedByUsage, ...remaining];

  return (
    <div className="grid grid-cols-3 gap-4 lg:grid-cols-4">
      {finalList.map((feature) => {
        const Icon = feature.icon;
        return (
          <Link key={feature.id} to={feature.path} className="block">
            <Card className="group h-full border-border bg-card transition-shadow hover:shadow-lg">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className="rounded-lg bg-muted p-2 text-foreground">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-sm font-semibold text-foreground">
                      {t(feature.titleKey)}
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      {t(feature.descKey)}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>
        );
      })}
    </div>
  );
};
