import { Badge } from "@/components/ui/badge";

const videoFormats = [
  "MP4",
  "MKV",
  "MOV",
  "WebM",
  "AVI",
  "FLV",
  "WMV",
  "MPEG",
  "M4V",
  "OGV",
  "3GP",
  "MPG",
];

const audioFormats = ["MP3", "WAV", "AAC", "FLAC", "OGG", "M4A", "WMA", "AIFF"];

export function Formats() {
  return (
    <section className="py-24 bg-card/30">
      <div className="container m-auto px-4">
        <div className="text-center mb-16">
          <h2 className="text-4xl md:text-5xl font-bold mb-4 text-balance">
            Support for{" "}
            <span className="text-primary">Mainstream & Niche Formats</span>
          </h2>
          <p className="text-xl text-muted-foreground text-pretty">
            Whether it's common MP4, MOV, or professional MKV, WebM—we handle it
            all with ease
          </p>
        </div>

        <div className="max-w-4xl mx-auto space-y-8">
          <div>
            <h3 className="text-2xl font-bold mb-6 flex items-center gap-2">
              <span className="text-primary">●</span> Video Formats
            </h3>
            <div className="flex flex-wrap gap-3">
              {videoFormats.map((format) => (
                <Badge
                  key={format}
                  variant="outline"
                  className="px-6 py-3 text-base font-mono border-primary/30 hover:bg-primary/10 hover:border-primary/50 transition-all"
                >
                  {format}
                </Badge>
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-2xl font-bold mb-6 flex items-center gap-2">
              <span className="text-primary">●</span> Audio Formats
            </h3>
            <div className="flex flex-wrap gap-3">
              {audioFormats.map((format) => (
                <Badge
                  key={format}
                  variant="outline"
                  className="px-6 py-3 text-base font-mono border-primary/30 hover:bg-primary/10 hover:border-primary/50 transition-all"
                >
                  {format}
                </Badge>
              ))}
            </div>
          </div>

          <p className="text-center text-muted-foreground italic pt-4">
            + Many more formats continuously being added...
          </p>
        </div>
      </div>
    </section>
  );
}
