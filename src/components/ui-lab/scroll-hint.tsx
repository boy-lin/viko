import React, { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

type ScrollHintRender = (params: {
  ref: React.RefCallback<HTMLElement>;
  showHint: boolean;
}) => React.ReactNode;

interface ScrollHintProps {
  children: ScrollHintRender;
}

const ScrollHint: React.FC<ScrollHintProps> = ({ children }) => {
  const elementRef = useRef<HTMLElement | null>(null);
  const [showHint, setShowHint] = useState(false);

  useEffect(() => {
    const el = elementRef.current;
    if (!el) return;

    const updateHint = () => {
      const canScroll = el.scrollHeight > el.clientHeight + 1;
      const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 4;
      setShowHint(canScroll && !atBottom);
    };

    updateHint();
    el.addEventListener("scroll", updateHint);
    const resizeObserver = new ResizeObserver(updateHint);
    resizeObserver.observe(el);

    return () => {
      el.removeEventListener("scroll", updateHint);
      resizeObserver.disconnect();
    };
  }, []);

  const refCallback = (node: HTMLElement | null) => {
    elementRef.current = node;
  };

  return <>{children({ ref: refCallback, showHint })}</>;
};

export const ScrollHintIndicator: React.FC<React.ComponentProps<"div">> = (props) => (
  <div {...props} className={cn("pointer-events-none absolute bottom-1 left-1/2 -translate-x-1/2 rounded-full bg-popover/80 px-2 py-0 border z-10", props.className)}>
    <ChevronDown className="h-3 w-3 text-muted-foreground" />
  </div>
);

export default ScrollHint;
