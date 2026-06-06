"use client";

import Background from "./Background";
import Hero from "./Hero";
import Workflow from "./Workflow";
import BentoFeatures from "./BentoFeatures";
import Architecture from "./Architecture";
import Showcase from "./Showcase";
import OpenSource from "./OpenSource";
import Footer from "./Footer";

export default function Dashboard() {
  return (
    <div className="relative min-h-screen overflow-x-hidden text-white">
      <Background />
      
      <main>
        <Hero />
        <Workflow />
        <BentoFeatures />
        <Architecture />
        <Showcase />
        <OpenSource />
      </main>
      <Footer />
    </div>
  );
}
