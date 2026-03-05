import { useState } from "react";
import { Theme } from "@/components/ui/theme";
import { HighSpeedConversionBadge } from "@/layout/HighSpeedConversionBadge";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { UserMenu } from "@/components/auth/UserMenu";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { MessageSquare } from "lucide-react";

export default function Header() {
  const [helpOpen, setHelpOpen] = useState(false);

  return (
    <header className="bg-background px-4 py-2 flex items-center justify-end gap-3">
      <HighSpeedConversionBadge />

      <Theme
        size="sm"
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

      <Button
        variant="secondary"
        size="sm"
        className="shadow-none cursor-pointer"
        onClick={() => setHelpOpen(true)}
      >
        <MessageSquare className="w-4 h-4" />
        在线帮助
      </Button>
      <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>在线帮助与联系方式</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 text-sm text-muted-foreground">
            <p>
              如果你有功能上的意见建议，或者在使用过程中遇到问题，可以通过下面的方式联系我。
            </p>
            <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
              <div>
                X:
                {" "}
                <a
                  className="text-primary hover:underline"
                  href="https://x.com/evilHolly1"
                  target="_blank"
                  rel="noreferrer"
                >
                  https://x.com/evilHolly1
                </a>
              </div>
              <div>
                Email:
                {" "}
                <a
                  className="text-primary hover:underline"
                  href="mailto:xiaoyaosha@gmail.com"
                >
                  xiaoyaosha@gmail.com
                </a>
              </div>
              <div>Telegram: @HollyWWH</div>
              <div>小红书账号/昵称: 5729257995/赛亚人86</div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      <UserMenu />
    </header>
  );
}
