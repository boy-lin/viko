import { Theme } from "@/components/ui/theme";
import { HighSpeedConversionBadge } from "@/layout/HighSpeedConversionBadge";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { UserMenu } from "@/components/auth/UserMenu";

export default function Header() {
  return (
    <header className="bg-background px-4 py-2 flex items-center justify-end gap-3">
      <HighSpeedConversionBadge />

      <Theme
        size="md"
        variant="dropdown"
        themes={["light", "dark", "system"]}
        className="cursor-pointer border-transparent bg-secondary px-[9px] py-[9px] h-auto"
      />
      <LanguageSwitcher />

      {/* <Button variant="secondary" size="icon" className="shadow-none">
        <Gift className="w-5 h-5 text-pink-500" />
      </Button> */}
      {/* <Badge
        variant="outline"
        className="bg-purple-50 text-purple-700 border-purple-200 py-2 rounded-lg"
      >
        🎁 First Login Credit Bonus
      </Badge> */}

      {/* <Button variant="secondary" size="icon" className="shadow-none">
        <MessageSquare className="w-5 h-5" />
      </Button> */}
      <UserMenu />
    </header>
  );
}
