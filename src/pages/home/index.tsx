import { HeroCard } from "./blocks/HeroCard";
import { ToolsTab } from "./blocks/ToolsTab";

export default function Home() {
  return (
    <main className="px-4">
      <HeroCard />
      <ToolsTab />
    </main>
  );
}
