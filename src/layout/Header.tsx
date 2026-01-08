import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Gift, MessageSquare, Headphones } from "lucide-react";
import { Theme } from "@/components/ui/theme";

export default function Header() {
  return (
    <header className="bg-background px-6 py-3 flex items-center justify-end gap-3">
      <Theme
        size="md"
        variant="dropdown"
        themes={["light", "dark", "system"]}
        className="border-transparent bg-secondary px-[9px] py-[9px] h-auto"
      />

      <Button variant="secondary" size="icon" className="shadow-none">
        <Gift className="w-5 h-5 text-pink-500" />
      </Button>
      <Badge
        variant="outline"
        className="bg-purple-50 text-purple-700 border-purple-200 py-2 rounded-lg"
      >
        🎁 First Login Credit Bonus
      </Badge>
      <Button variant="secondary" size="icon" className="shadow-none">
        <MessageSquare className="w-5 h-5" />
      </Button>
      <Button variant="secondary" size="icon" className="shadow-none">
        <Headphones className="w-5 h-5" />
      </Button>
    </header>
  );
}
