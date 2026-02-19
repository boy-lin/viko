import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Loader2, LogOut } from "lucide-react";
import ProfileLinear from "@/components/icons/ProfileLinear";
import { AuthDialog } from "@/components/auth/AuthDialog";
import { signOut, useSession } from "@/lib/auth-client";
import { useUserStore } from "@/stores/user";
import { toast } from "sonner";
import { analytics } from "@/lib/analytics";

export const UserMenu = () => {
  const { data: session, isPending } = useSession();
  const { userInfo, fetchUserInfo, clearUser } = useUserStore();
  const [dialogOpen, setDialogOpen] = useState(false);
  const displayName = useMemo(
    () => userInfo?.name || session?.user?.name || session?.user?.email || "User",
    [session?.user, userInfo]
  );

  useEffect(() => {
    if (session?.user) {
      fetchUserInfo().catch(() => {
        toast.error("获取用户信息失败");
      });
    }
  }, [session?.user, fetchUserInfo]);

  useEffect(() => {
    if (session?.user?.id) {
      analytics.identify(session.user.id, {
        email: session.user.email,
        name: session.user.name,
      });
    }
  }, [session?.user?.id, session?.user?.email, session?.user?.name]);

  const handleLogout = async () => {
    try {
      await signOut();
      clearUser();
      toast.success("已退出登录");
    } catch (e) {
      toast.error("退出失败");
    }
  };

  if (isPending) {
    return (
      <Button variant="secondary" size="icon" className="shadow-none" disabled>
        <Loader2 className="w-4 h-4 animate-spin" />
      </Button>
    );
  }

  if (!session?.user) {
    return (
      <>
        <Button
          variant="secondary"
          size="sm"
          className="cursor-pointer shadow-none font-medium px-3"
          onClick={() => setDialogOpen(true)}
        >
          登录
        </Button>
        <AuthDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          onSuccess={() => {
            setDialogOpen(false);
            fetchUserInfo();
          }}
        />
      </>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="secondary" size="icon" className="cursor-pointer shadow-none">
          <ProfileLinear className="w-5 h-5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="flex flex-col">
          <span className="font-semibold text-foreground">{displayName}</span>
          {session.user?.email && (
            <span className="text-xs text-muted-foreground">{session.user.email}</span>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="text-red-600 focus:text-red-700"
          onClick={handleLogout}
        >
          <LogOut className="w-4 h-4 mr-2" />
          退出登录
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default UserMenu;
