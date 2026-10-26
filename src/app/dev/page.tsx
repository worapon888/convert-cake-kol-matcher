import Link from "next/link";
import { BrandAnalyzerTestBench } from "@/components/brand/BrandAnalyzerTestBench";

export default function DevTestBenchPage() {
  return (
    <main className="min-h-screen bg-slate-50">
      <div className="bg-slate-900 text-white px-4 py-2 text-xs flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-mono bg-purple-600 px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider">
            Developer Environment
          </span>
          <span>
            Step 3 & 4 Technical Test Bench (Brand Analyzer & KOL Matching
            Engine)
          </span>
        </div>
        <Link
          href="/"
          className="text-purple-300 hover:text-white underline underline-offset-4 font-medium"
        >
          ← Return to Screen 01 (Onboarding)
        </Link>
      </div>
      <BrandAnalyzerTestBench />
    </main>
  );
}
