import { Navbar } from "@/components/Navbar";
import { Hero } from "@/components/Hero";
import { UploadZone } from "@/components/UploadZone";
import { Features } from "@/components/Features";
import { EncryptionTester } from "@/components/EncryptionTester";

const Index = () => {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main>
        <Hero />
        <UploadZone />
        <Features />
        <EncryptionTester />
      </main>
    </div>
  );
};

export default Index;
