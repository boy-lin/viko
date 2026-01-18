import React, { createContext, useContext, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ChevronLeft,
  ChevronRight,
  FileText,
  Home,
  Plus,
  Wrench,
  AudioLines,
  Download,
  Video,
} from "lucide-react";
import { cn } from "@/lib/utils";

type NavItem = {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  href?: string;
};

type QuickAccessItem = {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  href?: string;
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

const sidebarNavItems: NavItem[] = [
  { label: "Home", icon: Home, href: "/" },
  { label: "AI Tools", icon: Wrench, href: "/tools" },
  { label: "My Files", icon: FileText, href: "/my/files" },
];

const quickAccessItems: QuickAccessItem[] = [
  {
    label: "Converter",
    icon: Download,
    color: "text-purple-600",
    href: "/converter",
  },
  {
    label: "Downloader",
    icon: Download,
    color: "text-orange-600",
    href: "/downloader",
  },
  {
    label: "Compressor",
    icon: Download,
    color: "text-green-600",
    href: "/compressor",
  },
  {
    label: "Audio Test",
    icon: AudioLines,
    color: "text-purple-600",
    href: "/demo/audio-test",
  },
  {
    label: "Home V1",
    icon: Home,
    color: "text-purple-600",
    href: "/demo/v1",
  },
  {
    label: "Video Player",
    icon: Video,
    color: "text-purple-600",
    href: "/ui/video-player",
  },
];

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
  return (
    <motion.div variants={itemVariants} className="p-4">
      <div className="flex items-center gap-2 h-9">
        <div className="w-8 h-8 bg-gradient-to-br from-purple-600 to-blue-600 rounded-lg flex items-center justify-center grow-0 shrink-0">
          <div className="w-4 h-4 bg-white rounded-sm"></div>
        </div>
        <motion.div
          animate={{
            display: animate ? (open ? "block" : "none") : "block",
            opacity: animate ? (open ? 1 : 0) : 1,
          }}
        >
          <div className="text-xs text-muted-foreground">Figurex</div>
          <div className="text-sm font-bold">UniConverter</div>
        </motion.div>
      </div>
    </motion.div>
  );
};

const SidebarNavItem = ({ item }: { item: NavItem }) => {
  const Icon = item.icon;
  const navigate = useNavigate();
  const location = useLocation();
  const isActive = item.href
    ? item.href === "/"
      ? location.pathname === "/"
      : location.pathname.startsWith(item.href)
    : false;

  return (
    <motion.button
      variants={itemVariants}
      onClick={() => item.href && navigate(item.href)}
      className={cn(
        "w-full flex items-center gap-3 px-3 h-10 rounded-lg text-foreground transition-colors",
        isActive
          ? "bg-secondary-foreground text-background font-medium"
          : "hover:bg-muted"
      )}
    >
      <Icon className="w-5 h-5 flex-shrink-0" />
      <SidebarLabel>{item.label}</SidebarLabel>
    </motion.button>
  );
};

const SidebarQuickAccessItem = ({ item }: { item: QuickAccessItem }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const isActive = item.href ? location.pathname.startsWith(item.href) : false;

  return (
    <motion.button
      variants={itemVariants}
      onClick={() => item.href && navigate(item.href)}
      className={cn(
        "w-full h-10 flex items-center gap-3 px-3 py-2 rounded-lg transition-colors",
        isActive
          ? "bg-white shadow-sm font-medium text-foreground"
          : "text-gray-700 hover:bg-white/50"
      )}
    >
      <div className={cn("w-5 h-5 flex-shrink-0", item.color)}>
        <item.icon className="w-5 h-5" />
      </div>
      <SidebarLabel>{item.label}</SidebarLabel>
    </motion.button>
  );
};

const SidebarQuickAccess = () => (
  <motion.div variants={itemVariants} className="">
    <div className="flex items-center justify-between px-3 py-2">
      <SidebarLabel useVisible className="text-xs text-gray-500 font-medium">
        Quick Access
      </SidebarLabel>
      <SidebarLabel className="inline-flex text-gray-400">
        <Plus className="w-4 h-4" />
      </SidebarLabel>
    </div>
    <motion.div variants={listVariants} className="space-y-1 mt-1">
      {quickAccessItems.map((item) => (
        <SidebarQuickAccessItem key={item.label} item={item} />
      ))}
    </motion.div>
  </motion.div>
);

const SidebarNav = () => (
  <motion.nav variants={listVariants} className="flex-1 p-3 space-y-1">
    {sidebarNavItems.map((item) => (
      <SidebarNavItem key={item.label} item={item} />
    ))}
    <SidebarQuickAccess />
  </motion.nav>
);

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
  const Icon = open ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      title={open ? "收起侧边栏" : "展开侧边栏"}
      onClick={() => setOpen((prev) => !prev)}
      className="cursor-pointer absolute right-0 top-1/2 z-10 flex h-9 w-2 -translate-y-1/2 translate-x-1/2 items-center justify-center rounded-full border border-border/50 bg-background backdrop-blur-sm text-foreground shadow-sm transition hover:bg-muted hover:scale-110"
    >
      <Icon className="h-4 w-4" />
    </button>
  );
};

const DesktopSidebar = ({ className }: { className?: string }) => {
  const { open, animate } = useSidebar();
  const width = open ? "16rem" : "4.5rem";
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
        "relative w-64 bg-secondary border-r border-border flex flex-col",
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
