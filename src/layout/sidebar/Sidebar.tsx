import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ChevronLeft,
  ChevronRight,
  ListOrdered,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { MenuItems } from "./menu";
import HomeLinear from "@/components/icons/HomeLinear";
import FolderLinear from "@/components/icons/FolderLinear";
import AILinear from "@/components/icons/AILinear";
import PinLinear from "@/components/icons/PinLinear";
import PinCancelLinear from "@/components/icons/PinCancelLinear";
import { useAppStore } from "@/stores/app";
import ScrollHint, { ScrollHintIndicator } from "@/components/ui-lab/scroll-hint";
import { QuickAccessItem, QUICK_ACCESS_CONFIG } from "./menu";

type NavItem = {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  href?: string;
  disabled?: boolean;
  badgeCount?: number;
};



type SidebarContextValue = {
  open: boolean;
  setOpen: React.Dispatch<React.SetStateAction<boolean>>;
  animate: boolean;
};

const SidebarContext = createContext<SidebarContextValue | undefined>(
  undefined
);

const useSidebar = () => {
  const context = useContext(SidebarContext);
  if (!context) {
    throw new Error("useSidebar must be used within a SidebarProvider");
  }
  return context;
};

const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.06,
      delayChildren: 0.05,
    },
  },
};

const listVariants = {
  hidden: {},
  show: {
    transition: {
      staggerChildren: 0.05,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, x: -6 },
  show: { opacity: 1, x: 0 },
};


const SidebarProvider = ({
  children,
  open: openProp,
  setOpen: setOpenProp,
  animate = true,
}: {
  children: React.ReactNode;
  open?: boolean;
  setOpen?: React.Dispatch<React.SetStateAction<boolean>>;
  animate?: boolean;
}) => {
  const [openState, setOpenState] = useState(true);
  const open = openProp ?? openState;
  const setOpen = setOpenProp ?? setOpenState;

  return (
    <SidebarContext.Provider value={{ open, setOpen, animate }}>
      {children}
    </SidebarContext.Provider>
  );
};

const SidebarLabel = ({
  className,
  children,
  useVisible = false,
}: {
  className?: string;
  children: React.ReactNode;
  useVisible?: boolean;
}) => {
  const { open, animate } = useSidebar();

  const style: any = {};

  if (useVisible) {
    style.visibility = animate ? (open ? "visible" : "hidden") : "visible";
  } else {
    style.display = animate ? (open ? "inline-block" : "none") : "inline-block";
  }

  return (
    <motion.span
      animate={{
        ...style,
        opacity: animate ? (open ? 1 : 0) : 1,
      }}
      className={cn("whitespace-pre", className)}
    >
      {children}
    </motion.span>
  );
};

const SidebarLogo = () => {
  const { open, animate } = useSidebar();
  const { t } = useTranslation("common");
  return (
    <motion.div variants={itemVariants} className="px-5 py-4">
      <div className="flex items-center gap-2 h-9">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center grow-0 shrink-0">
          <img src="/logo.png" alt="" />
        </div>
        <motion.div
          animate={{
            display: animate ? (open ? "block" : "none") : "block",
            opacity: animate ? (open ? 1 : 0) : 1,
          }}
        >
          <div className="text-xs text-muted-foreground">{t("sidebar.brand_name")}</div>
          <div className="text-sm font-bold">{t("sidebar.brand_tagline")}</div>
        </motion.div>
      </div>
    </motion.div>
  );
};

const SidebarNavItem = ({
  item,
}: {
  item: NavItem;
}) => {
  const { t } = useTranslation("common");
  const Icon = item.icon;
  const navigate = useNavigate();
  const location = useLocation();
  const isActive = item.href
    ? item.href === "/"
      ? location.pathname === "/"
      : location.pathname.startsWith(item.href)
    : false;
  const isDisabled = item.disabled;

  return (
    <motion.button
      variants={itemVariants}
      whileTap={{ scale: 0.98 }}
      onClick={() => {
        if (isDisabled) {
          toast.info(t("sidebar.feature_in_development"));
          return;
        }
        if (item.href) {
          navigate(item.href);
        } else {
          toast.info(t("sidebar.coming_soon"));
        }
      }}
      className={cn(
        "group relative w-full flex items-center gap-3 px-2 h-11 rounded-lg text-foreground transition-colors overflow-hidden",
        isActive
          ? "bg-indigo-50 text-indigo-700"
          : "hover:bg-slate-100  cursor-pointer"
        ,
        isDisabled && "cursor-not-allowed"
      )}
    >
      <span
        className={cn(
          "absolute left-0 top-0 h-full w-1 rounded-r-full bg-indigo-500 transition-all",
          isActive ? "opacity-100" : "opacity-0 group-hover:opacity-70"
        )}
      />
      <div
        className={cn(
          "flex flex-shrink-0 h-8 w-8 items-center justify-center rounded-xl transition-all",
          isActive
            ? "bg-indigo-100 text-indigo-700"
            : "bg-slate-100 text-slate-500 group-hover:scale-105 group-hover:text-slate-700"
        )}
      >
        <Icon className="w-5 h-5" />
      </div>
      <SidebarLabel className={cn(
        "flex-1 text-left text-sm font-medium",
        isActive ? "text-indigo-700" : "text-foreground group-hover:text-slate-700"
      )}>
        {item.label}
      </SidebarLabel>
      {typeof item.badgeCount === "number" && item.badgeCount > 0 && (
        <span className="ml-auto inline-flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-semibold px-1 h-4 min-w-4">
          {item.badgeCount > 99 ? "99+" : item.badgeCount}
        </span>
      )}
    </motion.button>
  );
};

const SidebarQuickAccessItem = ({
  item,
  isPinned,
  onTogglePin,
}: {
  item: QuickAccessItem;
  isPinned?: boolean;
  onTogglePin?: (href: string) => void;
}) => {
  const { t } = useTranslation("common");
  const navigate = useNavigate();
  const location = useLocation();
  const isActive = item.href ? location.pathname.startsWith(item.href) : false;

  return (
    <motion.div
      variants={itemVariants}
      whileTap={{ scale: 0.98 }}
      onClick={() =>
        item.href &&
        navigate(item.href, {
          state: { fromQuickAccess: true },
        })
      }
      className={cn(
        "w-full h-10 flex items-center px-2 py-2 rounded-lg transition-colors overflow-hidden group",
        isActive
          ? "bg-indigo-50"
          : "hover:bg-slate-100"
      )}
    >
      <div
        className={cn(
          "mr-2 flex flex-shrink-0 h-7 w-7 items-center justify-center rounded-lg transition-transform group-hover:scale-105",
          item.color
        )}
      >
        <item.icon className="w-5 h-5" />
      </div>
      <SidebarLabel
        className={cn(
          "text-sm truncate cursor-default",
          isActive ? "text-foreground" : "text-foreground/90 group-hover:text-slate-700"
        )}
      >
        <p title={t(item.label)}>
          {t(item.label)}
        </p>
      </SidebarLabel>
      {item.href && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onTogglePin?.(item.href as string);
          }}
          title={isPinned ? t("sidebar.unpin") : t("sidebar.pin")}
          className={cn(
            "cursor-pointer ml-auto h-8 w-8 flex items-center justify-center rounded-md transition",
            isPinned
              ? "text-indigo-600 hover:bg-white/10"
              : "text-foreground/60 hover:text-foreground hover:bg-white/10 opacity-0 group-hover:opacity-100"
          )}
        >
          {isPinned ? (
            <PinCancelLinear className="h-4 w-4" />
          ) : (
            <PinLinear className="h-4 w-4" />
          )}
        </button>
      )}
    </motion.div>
  );
};

const SidebarQuickAccess = ({
  fixedItems,
  recentItems,
  pinnedPaths,
  onTogglePin,
}: {
  fixedItems: QuickAccessItem[];
  recentItems: QuickAccessItem[];
  pinnedPaths: string[];
  onTogglePin: (href: string) => void;
}) => {
  const { t } = useTranslation("common");
  return (
    <motion.div variants={itemVariants} className="flex-1 min-h-0 flex flex-col">
      <div className="flex items-center justify-between px-3 py-2">
        <SidebarLabel useVisible className="text-xs text-foreground/50 font-medium">
          {t("sidebar.quick_access")}
        </SidebarLabel>
        {/* <SidebarLabel className="inline-flex text-foreground/40">
          <Plus className="w-4 h-4" />
        </SidebarLabel> */}
      </div>
      <motion.div variants={listVariants} className="relative flex-1 min-h-0 mt-1">
        <ScrollHint >
          {({ ref, showHint }) => (
            <>
              <div ref={ref} className="h-full overflow-y-auto hide-scrollbar space-y-1">
                {fixedItems.length > 0 && (
                  <>
                    {fixedItems.map((item) => (
                      <SidebarQuickAccessItem
                        key={`fixed_${item.href}`}
                        isPinned
                        item={item}
                        onTogglePin={onTogglePin}
                      />
                    ))}
                  </>
                )}
                {recentItems.length > 0 && (
                  <>
                    {recentItems.map((item) => (
                      <SidebarQuickAccessItem
                        key={`recent_${item.href}`}
                        item={item}
                        isPinned={pinnedPaths.includes(item.href ?? "")}
                        onTogglePin={onTogglePin}
                      />
                    ))}
                  </>
                )}
              </div>
              {showHint && <ScrollHintIndicator className="" />}
            </>
          )}
        </ScrollHint>
      </motion.div>

    </motion.div>
  );
};

const SidebarNav = () => {
  const { t } = useTranslation("common");
  const location = useLocation();
  const unreadFinishedCount = useAppStore((s) => s.unreadFinishedCount);
  const {
    pinnedPaths,
    recentPaths,
    togglePinQuickAccess,
    recordRecentQuickAccess,
  } =
    useAppStore();
  const isQuickAccessNav = (location.state as any)?.fromQuickAccess;

  const quickAccessConfigMap = useMemo(() => {
    return new Map(
      QUICK_ACCESS_CONFIG.filter((item) => item.href).map((item) => [
        item.href as string,
        item,
      ])
    );
  }, []);

  useEffect(() => {
    const trackable = QUICK_ACCESS_CONFIG.map((item) => item.href).filter(
      Boolean
    ) as string[];
    const matched = trackable.find((path) =>
      location.pathname.startsWith(path)
    );
    if (!matched || isQuickAccessNav) return;

    recordRecentQuickAccess(matched);
  }, [location.pathname, isQuickAccessNav, recordRecentQuickAccess]);

  const sidebarNavItems: NavItem[] = [
    { label: t("nav.home"), icon: HomeLinear, href: MenuItems.home },
    { label: t("nav.tasks"), icon: ListOrdered, href: MenuItems.tasks, badgeCount: unreadFinishedCount },
    { label: t("nav.my_files"), icon: FolderLinear, href: MenuItems.myFiles },
    { label: t("nav.ai_tools"), icon: AILinear, disabled: true },
  ];

  const fixedQuickAccessItems = pinnedPaths
    .map((path) => quickAccessConfigMap.get(path))
    .filter(Boolean) as QuickAccessItem[];
  const recentQuickAccessItems = recentPaths
    .filter((path) => !pinnedPaths.includes(path))
    .map((path) => quickAccessConfigMap.get(path))
    .filter(Boolean) as QuickAccessItem[];

  return (
    <motion.nav variants={listVariants} className="flex-1 min-h-0 p-3 space-y-2 flex flex-col">
      {sidebarNavItems.map((item, i) => (
        <SidebarNavItem
          key={`${item.href}_${i}`}
          item={item}
        />
      ))}
      <SidebarQuickAccess
        fixedItems={fixedQuickAccessItems}
        recentItems={recentQuickAccessItems}
        pinnedPaths={pinnedPaths}
        onTogglePin={togglePinQuickAccess}
      />
    </motion.nav>
  );
};

const SidebarContent = () => (
  <>
    <SidebarLogo />
    <SidebarNav />
    {/* Promo Banner */}
    {/* <div className="m-3 mb-4">
      <div className="bg-gradient-to-br from-red-500 to-pink-500 rounded-xl p-4 text-white">
        <div className="text-lg font-bold mb-1">Happy New Year</div>
        <div className="text-3xl font-bold mb-3">30% OFF</div>
        <button className="w-full bg-yellow-300 hover:bg-yellow-400 text-gray-900 font-semibold py-2 px-4 rounded-lg">
          Save Now
        </button>
        <div className="mt-3 text-center">🎉</div>
      </div>
    </div> */}
  </>
);

const SidebarToggle = () => {
  const { open, setOpen } = useSidebar();
  const { t } = useTranslation("common");
  const Icon = open ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      title={open ? t("sidebar.collapse") : t("sidebar.expand")}
      onClick={() => setOpen((prev) => !prev)}
      className="cursor-pointer absolute right-0 top-1/2 z-10 flex h-9 w-2 -translate-y-1/2 translate-x-1/2 items-center justify-center rounded-full border border-border/50 bg-background backdrop-blur-sm text-foreground shadow-sm transition hover:bg-muted hover:scale-110"
    >
      <Icon className="h-4 w-4" />
    </button>
  );
};

const DesktopSidebar = ({ className }: { className?: string }) => {
  const { open, animate } = useSidebar();
  const { i18n } = useTranslation("common");
  const isEnglish = (i18n.resolvedLanguage || i18n.language || "").startsWith("en");
  const width = open ? (isEnglish ? "14rem" : "13rem") : "4.25rem";
  return (
    <motion.aside
      initial={animate ? { opacity: 0, x: -8 } : undefined}
      animate={
        animate
          ? {
            opacity: 1,
            x: 0,
            width,
          }
          : undefined
      }
      transition={{ duration: 0.25, ease: "easeOut" }}
      style={animate ? undefined : { width }}
      className={cn(
        "relative w-64 bg-sidebar border-r border-r-1/2 flex flex-col",
        className
      )}
    >
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="show"
        className="flex h-full flex-col"
      >
        <SidebarContent />
      </motion.div>
      <SidebarToggle />
    </motion.aside>
  );
};

export default function Sidebar() {
  return (
    <SidebarProvider>
      <DesktopSidebar />
    </SidebarProvider>
  );
}
