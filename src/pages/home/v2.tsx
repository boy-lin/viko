import { Hero } from "./blocks/hero";
import { Benefits } from "./blocks/benefits";
import { Formats } from "./blocks/formats";
import { Privacy } from "./blocks/privacy";
import { CTA } from "./blocks/cta";
import { Footer } from "./blocks/footer";
import { HeroCard } from "./HeroCard";

export default function Home() {
  return (
    <main className="">
      <HeroCard />
      {/* <Hero />
      <Benefits />
      <Formats />
      <Privacy />
      <CTA />
      <Footer /> */}
    </main>
  );
}
