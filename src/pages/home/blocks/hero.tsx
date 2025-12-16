import { Button } from "@/components/ui/button";
import { Zap, Upload } from "lucide-react";
import { TranscoderDemo } from "./transcoder-demo";

export function Hero() {
  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
      {/* Animated background gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary/20 via-background to-background animate-gradient" />

      {/* Grid pattern overlay */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808008_1px,transparent_1px),linear-gradient(to_bottom,#80808008_1px,transparent_1px)] bg-[size:4rem_4rem]" />

      {/* Glow effect */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-96 h-96 bg-primary/30 rounded-full blur-[120px]" />

      <div className="relative z-10 container m-auto px-4 py-20 text-center">
        <h1 className="text-5xl md:text-7xl font-bold mb-6 text-balance bg-gradient-to-b from-foreground to-foreground/70 bg-clip-text text-transparent">
          Say Goodbye to Long Waits:
          <br />
          <span className="text-primary">Lightning-Fast</span> Video Transcoding
        </h1>

        <p className="text-xl md:text-2xl text-muted-foreground max-w-3xl mx-auto mb-12 text-pretty leading-relaxed">
          Whether you're a video editor, content creator, or enterprise user,
          our local transcoding tool supports 99% of mainstream formats.
          Privacy-first, efficiency-focused, completely free.
        </p>

        <TranscoderDemo />

        <div className="mt-8 flex items-center justify-center gap-8 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
            <span>100% Local Processing</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
            <span>No File Upload Required</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
            <span>Always Free</span>
          </div>
        </div>
      </div>
    </section>
  );
}
