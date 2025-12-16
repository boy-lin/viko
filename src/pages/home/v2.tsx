import { Hero } from "./blocks/hero";
import { Benefits } from "./blocks/benefits";
import { Formats } from "./blocks/formats";
import { Privacy } from "./blocks/privacy";
import { CTA } from "./blocks/cta";
import { Footer } from "./blocks/footer";

export default function Home() {
  return (
    <main className="min-h-screen">
      <Hero />
      <Benefits />
      <Formats />
      <Privacy />
      <CTA />
      <Footer />
    </main>
  );
}
