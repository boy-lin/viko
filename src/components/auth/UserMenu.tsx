import { useEffect, useMemo, useRef, useState } from "react";
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
import { Badge } from "@/components/ui/badge";
import { signOut, useSession } from "@/lib/auth-client";
import { clearDesktopToken, hasDesktopAccessToken } from "@/lib/desktop-auth";
import { useUserStore } from "@/stores/user";
import { toast } from "sonner";
import { analytics } from "@/lib/analytics";

export const UserMenu = () => {
  const { data: session, isPending } = useSession();
  const { userInfo, isTokenPreview, isProfileRefreshing, fetchUserInfo, clearUser } = useUserStore();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [desktopLoggedIn, setDesktopLoggedIn] = useState(hasDesktopAccessToken());
  const prevRefreshingRef = useRef(false);
  const isLoggedIn = Boolean(session?.user) || desktopLoggedIn;
  const displayName = useMemo(
    () => userInfo?.name || session?.user?.name || session?.user?.email || "User",
    [session?.user, userInfo]
  );
  useEffect(() => {
    if (isLoggedIn) {
      fetchUserInfo().catch((e: any) => {
        toast.error(e.message || "获取用户信息失败");
      });
    }
  }, [isLoggedIn, fetchUserInfo]);

  useEffect(() => {
    setDesktopLoggedIn(hasDesktopAccessToken());
  }, [dialogOpen]);

  useEffect(() => {
    const handleDesktopAuthSuccess = () => {
      setDesktopLoggedIn(true);
      setDialogOpen(false);
      toast.success("桌面登录成功");
    };

    const handleDesktopAuthError = (event: Event) => {
      const detail = (event as CustomEvent<{ message?: string }>).detail;
      toast.error(detail?.message || "桌面登录失败");
    };

    window.addEventListener("desktop-auth:success", handleDesktopAuthSuccess);
    window.addEventListener("desktop-auth:error", handleDesktopAuthError as EventListener);
    return () => {
      window.removeEventListener("desktop-auth:success", handleDesktopAuthSuccess);
      window.removeEventListener("desktop-auth:error", handleDesktopAuthError as EventListener);
    };
  }, [fetchUserInfo]);

  useEffect(() => {
    if (!isLoggedIn) {
      prevRefreshingRef.current = false;
      return;
    }
    if (isProfileRefreshing) {
      prevRefreshingRef.current = true;
      return;
    }
    if (prevRefreshingRef.current) {
      prevRefreshingRef.current = false;
      if (!isTokenPreview) {
        toast.success("用户资料已同步");
      }
    }
  }, [isLoggedIn, isProfileRefreshing, isTokenPreview]);

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
      if (session?.user) {
        await signOut();
      }
      clearDesktopToken();
      setDesktopLoggedIn(false);
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

  if (!isLoggedIn) {
    return (
      <>
        <Button
          variant="secondary"
          size="sm"
          className="h-9 cursor-pointer shadow-none font-medium px-3"
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
          {(session?.user?.email || userInfo?.email) && (
            <span className="text-xs text-muted-foreground">
              {session?.user?.email || userInfo?.email}
            </span>
          )}
          {isProfileRefreshing && (
            <Badge variant="outline" className="mt-2 w-fit text-[10px] px-1.5 py-0.5">
              正在同步资料
            </Badge>
          )}
          {!isProfileRefreshing && isTokenPreview && (
            <Badge variant="secondary" className="mt-2 w-fit text-[10px] px-1.5 py-0.5">
              基础资料模式
            </Badge>
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
