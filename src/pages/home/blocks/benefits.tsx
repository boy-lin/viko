import { Card, CardContent } from "@/components/ui/card";
import { Zap, FileVideo, Shield, DollarSign } from "lucide-react";

const benefits = [
  {
    icon: Zap,
    title: "Lightning Speed Engine",
    description:
      "Powered by robust FFmpeg technology, your video transcoding is as fast as lightning. Complete your work in seconds and save precious time for creativity.",
  },
  {
    icon: FileVideo,
    title: "Universal Compatibility",
    description:
      "Support for MP4, MKV, MOV, WebM, and 99% of video and audio formats. No format limitations—make your content accessible everywhere.",
  },
  {
    icon: Shield,
    title: "Local Processing, Privacy First",
    description:
      "Your files are transcoded entirely in your local browser, never uploaded to any server. 100% control over data security for peace of mind.",
  },
  {
    icon: DollarSign,
    title: "Forever Free, Unlimited Value",
    description:
      "No subscriptions, no hidden fees. We provide enterprise-grade transcoding features completely free, helping you boost productivity effortlessly.",
  },
];

export function Benefits() {
  return (
    <section className="py-24 relative">
      <div className="container m-auto px-4">
        <div className="text-center mb-16">
          <h2 className="text-4xl md:text-5xl font-bold mb-4 text-balance">
            Why Choose Us?{" "}
            <span className="text-primary">
              Efficiency, Professionalism, Peace of Mind
            </span>
          </h2>
          <p className="text-xl text-muted-foreground text-pretty">
            Everything you need, right at your fingertips
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-6 max-w-5xl mx-auto">
          {benefits.map((benefit, index) => {
            const Icon = benefit.icon;
            return (
              <Card
                key={index}
                className="bg-card/50 backdrop-blur-sm border-primary/20 hover:border-primary/50 transition-all hover:shadow-lg hover:shadow-primary/10"
              >
                <CardContent className="p-8">
                  <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-6">
                    <Icon className="w-6 h-6 text-primary" />
                  </div>
                  <h3 className="text-2xl font-bold mb-3">{benefit.title}</h3>
                  <p className="text-muted-foreground leading-relaxed">
                    {benefit.description}
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </section>
  );
}
