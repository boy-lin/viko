import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Shield, Lock, Eye } from "lucide-react";

export function Privacy() {
  return (
    <section className="py-24 relative overflow-hidden">
      {/* Background glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-primary/20 rounded-full blur-[150px]" />

      <div className="container m-auto px-4 relative z-10">
        <div className="max-w-4xl mx-auto">
          <Card className="bg-card/50 backdrop-blur-sm border-primary/30 shadow-xl shadow-primary/10">
            <CardContent className="p-12">
              <div className="flex justify-center mb-8">
                <div className="w-20 h-20 rounded-2xl bg-primary/10 flex items-center justify-center">
                  <Shield className="w-10 h-10 text-primary" />
                </div>
              </div>

              <h2 className="text-4xl md:text-5xl font-bold text-center mb-6 text-balance">
                Your Privacy, Our Commitment:
                <br />
                <span className="text-primary">100% Local Processing</span>
              </h2>

              <p className="text-xl text-center text-muted-foreground mb-12 text-pretty">
                In an era where data security matters more than ever, we
                understand your concerns. That's why we chose the most thorough
                protection method.
              </p>

              <div className="grid md:grid-cols-3 gap-8 mb-12">
                <div className="text-center">
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                    <Lock className="w-6 h-6 text-primary" />
                  </div>
                  <h3 className="font-bold text-lg mb-2">
                    No Upload, No Leaks
                  </h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    All transcoding happens locally in your browser—files never
                    pass through any server
                  </p>
                </div>

                <div className="text-center">
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                    <Eye className="w-6 h-6 text-primary" />
                  </div>
                  <h3 className="font-bold text-lg mb-2">
                    Your Work, You Own It
                  </h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    Ensures your video content and personal info are absolutely
                    secure for worry-free creation
                  </p>
                </div>

                <div className="text-center">
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                    <Shield className="w-6 h-6 text-primary" />
                  </div>
                  <h3 className="font-bold text-lg mb-2">Transparent Code</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    Open architecture you can trust—see exactly how your data is
                    handled
                  </p>
                </div>
              </div>

              <div className="text-center">
                <Button
                  size="lg"
                  className="px-8 py-6 bg-primary hover:bg-primary/90 shadow-lg shadow-primary/50"
                  onClick={() => {
                    document.getElementById("transcoder-demo")?.scrollIntoView({
                      behavior: "smooth",
                    });
                  }}
                >
                  Experience Now, Worry-Free
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </section>
  );
}
