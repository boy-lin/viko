import { Zap } from "lucide-react";

export function Footer() {
  return (
    <footer className="border-t border-border/50 py-12 bg-card/30">
      <div className="container m-auto px-4">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Zap className="w-5 h-5 text-primary" />
            </div>
            <span className="text-xl font-bold">TurboTranscode</span>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-6 text-sm text-muted-foreground">
            <a href="#" className="hover:text-primary transition-colors">
              About Us
            </a>
            <a href="#" className="hover:text-primary transition-colors">
              Contact
            </a>
            <a href="#" className="hover:text-primary transition-colors">
              Privacy Policy
            </a>
            <a href="#" className="hover:text-primary transition-colors">
              Terms of Service
            </a>
          </div>

          <p className="text-sm text-muted-foreground">
            © 2025 TurboTranscode. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
