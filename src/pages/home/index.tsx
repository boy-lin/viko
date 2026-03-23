import { HeroCard } from "./blocks/HeroCard";
import { ToolsTab } from "./blocks/ToolsTab";

export default function Home() {
  return (
    <main className="px-4 fx-scrollbar fx-scrollbar-y h-full">
      <HeroCard />
      <ToolsTab />
    </main>
  );
}
