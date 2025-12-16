import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";

export function CTA() {
  return (
    <section className="py-24 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-t from-primary/20 to-background" />

      <div className="container m-auto px-4 relative z-10">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-4xl md:text-6xl font-bold mb-6 text-balance">
            Start Your <span className="text-primary">Lightning-Fast</span>{" "}
            Transcoding Journey!
          </h2>

          <p className="text-xl text-muted-foreground mb-12 text-pretty">
            Say goodbye to cumbersome software, no registration needed. Enjoy
            efficient and convenient professional transcoding service instantly.
          </p>

          <Button
            size="lg"
            className="text-lg px-10 py-7 bg-primary hover:bg-primary/90 shadow-2xl shadow-primary/50 group"
            onClick={() => {
              document.getElementById("transcoder-demo")?.scrollIntoView({
                behavior: "smooth",
              });
            }}
          >
            Launch Free Transcoding Now
            <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
          </Button>
        </div>
      </div>
    </section>
  );
}
