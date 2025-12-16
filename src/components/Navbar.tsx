"use client";

import { useState } from "react";
import { Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
} from "@/components/ui/navigation-menu";

export function Navbar() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const menuItems = [
    {
      title: "转换器",
      items: [
        { name: "音频转换器", href: "#audio-converter", disabled: false },
        { name: "视频转换器", href: "#video-converter", disabled: false },
        { name: "图片转换器", href: "#image-converter", disabled: false },
      ],
    },
    {
      title: "音频",
      items: [
        { name: "音频修剪", href: "#audio-trim", disabled: false },
        { name: "音频调整", href: "#audio-adjust", disabled: false },
        { name: "音量调整", href: "#volume-adjust", disabled: false },
      ],
    },
    {
      title: "视频",
      items: [
        { name: "视频编辑器", href: "#video-editor", disabled: false },
        { name: "屏幕录制", href: "#screen-record", disabled: false },
        { name: "合并视频", href: "#merge-videos", disabled: false },
        { name: "修剪视频", href: "#trim-video", disabled: false },
        { name: "裁剪视频", href: "#crop-video", disabled: false },
        { name: "旋转视频", href: "#rotate-video", disabled: false },
        { name: "翻转视频", href: "#flip-video", disabled: false },
        { name: "调整视频大小", href: "#resize-video", disabled: false },
        { name: "循环视频", href: "#loop-video", disabled: false },
        { name: "更改视频音量", href: "#change-volume", disabled: false },
        { name: "更改视频速度", href: "#change-speed", disabled: false },
        { name: "视频录制器", href: "#video-recorder", disabled: false },
      ],
    },
    {
      title: "关于",
      items: [{ name: "模块管理", href: "/modules", disabled: false }],
    },
  ];

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-md border-b border-white/10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center h-16 gap-4">
          {/* Logo */}
          <a href="/" className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-cyan-400 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-sm">TT</span>
            </div>
            <span className="text-xl font-bold">TurboTranscode</span>
          </a>

          {/* Desktop Menu */}
          <div className="hidden md:flex items-center gap-4">
            <NavigationMenu viewport={false}>
              <NavigationMenuList>
                {menuItems.map((menu) => (
                  <NavigationMenuItem key={menu.title}>
                    <NavigationMenuTrigger className="shadow-none">
                      {menu.title}
                    </NavigationMenuTrigger>
                    <NavigationMenuContent className=" bg-background border border-white/10 rounded-lg shadow-xl overflow-hidden p-1">
                      <div className="w-48">
                        {menu.items.map((item) => (
                          <NavigationMenuLink
                            key={item.name}
                            href={item.href}
                            onClick={(e) => {
                              if (item.disabled) {
                                e.preventDefault();
                                e.stopPropagation();
                              }
                            }}
                            aria-disabled={item.disabled}
                            className={`block px-4 py-2 text-sm transition-colors rounded-sm ${
                              item.disabled
                                ? "text-muted-foreground cursor-not-allowed pointer-events-none opacity-60"
                                : "text-background hover:bg-blue-500/20 hover:text-white"
                            }`}
                          >
                            {item.name}
                          </NavigationMenuLink>
                        ))}
                      </div>
                    </NavigationMenuContent>
                  </NavigationMenuItem>
                ))}
              </NavigationMenuList>
            </NavigationMenu>
          </div>

          {/* Mobile Menu Button */}
          <button
            className="md:hidden text-white"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            {mobileMenuOpen ? (
              <X className="w-6 h-6" />
            ) : (
              <Menu className="w-6 h-6" />
            )}
          </button>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="md:hidden pb-4">
            {menuItems.map((menu) => (
              <div key={menu.title} className="py-2">
                <div className="font-semibold text-white px-4 py-2">
                  {menu.title}
                </div>
                <div className="space-y-1">
                  {menu.items.map((item) => (
                    <a
                      key={item.name}
                      href={item.href}
                      aria-disabled={item.disabled}
                      className={`block px-8 py-2 text-sm transition-colors ${
                        item.disabled
                          ? "text-gray-400 cursor-not-allowed opacity-60 pointer-events-none"
                          : "text-gray-300 hover:bg-blue-500/20 hover:text-white"
                      }`}
                      onClick={(e) => {
                        if (item.disabled) {
                          e.preventDefault();
                          e.stopPropagation();
                          return;
                        }
                        setMobileMenuOpen(false);
                      }}
                    >
                      {item.name}
                    </a>
                  ))}
                </div>
              </div>
            ))}
            <div className="px-4 mt-4">
              <Button className="w-full bg-gradient-to-r from-blue-500 to-cyan-400 hover:from-blue-600 hover:to-cyan-500 text-white">
                开始转码
              </Button>
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}
