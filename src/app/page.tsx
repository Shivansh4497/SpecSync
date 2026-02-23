"use client";

import { useState, useEffect } from "react";
import { Share, Laptop, AlertCircle, RefreshCcw, Zap, Globe, Coins, HardDrive, Lightbulb } from "lucide-react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const PILLS = [
  "✈️ I travel constantly",
  "🧠 I run local AI models",
  "📑 I have 100 tabs open",
];

type State = "idle" | "loading" | "success" | "error" | "clarify";

const ICON_MAP: Record<string, any> = {
  Zap, Globe, Coins, HardDrive, Laptop
};

const HARDCODED_CLARIFY = {
  budget: {
    question: "What is your target budget?",
    suggested_answers: [
      { text: "Under $800", key: "budget", value: 800 },
      { text: "Around $1500", key: "budget", value: 1500 },
      { text: "Around $2500", key: "budget", value: 2500 },
      { text: "No strict limit", key: "budget", value: 10000 }
    ],
    found_signals: []
  },
  compute_intensity: {
    question: "How intense is your daily workflow?",
    suggested_answers: [
      { text: "Basic (Web, Office)", key: "compute_intensity", value: "Basic" },
      { text: "Moderate (Light editing)", key: "compute_intensity", value: "Moderate" },
      { text: "Heavy (Video, Gaming)", key: "compute_intensity", value: "Heavy" },
      { text: "Intense (3D Render, AI)", key: "compute_intensity", value: "Intense" }
    ],
    found_signals: []
  }
};

const highlightTradeoff = (text: string) => {
  if (!text) return null;
  const regex = /(\b(?:savings|save|saved|performance|roi)\b|\$\d+(?:,\d+)?|\*\*CONSULTANT'S NOTE:\*\*)/i;
  const parts = text.split(regex);
  return parts.map((part, i) => {
    const lower = part.toLowerCase();
    if (['savings', 'save', 'saved'].includes(lower) || lower.startsWith('$')) {
      return <span key={i} className="font-semibold text-emerald-600">{part}</span>;
    }
    if (['performance', 'roi'].includes(lower)) {
      return <span key={i} className="font-semibold text-zinc-900">{part}</span>;
    }
    if (lower === "**consultant's note:**") {
      return <span key={i} className="font-bold text-amber-700 mr-1 block sm:inline">CONSULTANT'S NOTE:</span>;
    }
    return part.replace(/\*\*/g, '');
  });
};

export default function SpecSyncMVP() {
  const [query, setQuery] = useState("");
  const [state, setState] = useState<State>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [result, setResult] = useState<any>(null);
  const [toastMessage, setToastMessage] = useState("");
  const [context, setContext] = useState("");
  const [clarifyInput, setClarifyInput] = useState("");
  const [clarifyData, setClarifyData] = useState<any>(null);
  const [refinementInput, setRefinementInput] = useState("");
  const [cumulativeProfile, setCumulativeProfile] = useState<Record<string, string>>({});
  const [localProfile, setLocalProfile] = useState<Record<string, any>>({});
  const [clarifySubmitCount, setClarifySubmitCount] = useState(0);

  const handleAPIResponse = (data: any, currentState: string) => {
    if (data.status === "success") {
      setResult(data);
      setErrorMessage("");
      if (data.final_profile) {
        setCumulativeProfile(prev => {
          const next = { ...prev };
          data.final_profile.forEach((item: any) => {
            if (item.label && item.value) {
              next[item.label] = item.value;
            }
          });
          return next;
        });
      }
      setState("success");
    } else if (data.status === "clarify") {
      // FIX THE LEAK: Immediately assimilate AI-discovered signals into local memory!
      if (data.found_signals) {
        setLocalProfile(prev => {
          const next = { ...prev };
          data.found_signals.forEach((item: any) => {
            if (item.signal && item.value) {
              next[item.signal] = item.value;
            }
          });
          return next;
        });
      }
      setClarifyData(data);
      setClarifyInput("");
      setErrorMessage("");
      setState("clarify");
    } else if (data.status === "conflict") {
      const conflictReport = data.violation_reports?.find((r: any) => r.severity === "CONFLICT");
      setErrorMessage(conflictReport?.technical_educational_message || data.message || "Hardware physics violation detected.");

      // Explicitly destroy residual recommendations array data
      // so the 3-tier grid cannot accidentally render under any circumstance.
      setResult(null);

      // Deterministic "Way Out" Buttons
      if (conflictReport?.resolutions) {
        setClarifyData({
          question: "We hit a physics snag. How would you like to resolve this?",
          suggested_answers: conflictReport.resolutions.map((r: any) => ({
            text: r.label,
            key: r.action === "UPDATE_BUDGET" ? "budget" : (r.action === "UPDATE_OS" ? "os_preference" : "constraint"),
            value: r.newValue
          })),
          found_signals: Object.entries(localProfile).map(([k, v]) => ({ signal: k, value: String(v), icon: "Laptop" }))
        });
        setState("clarify");
        return;
      }

      // Explicitly abort loading and bypass success views
      // Unconditionally render the Amber Conflict/Error UI component
      setState("error");
    } else {
      setErrorMessage(data.message || "We could not find a fit based on the provided details.");

      if (currentState === "clarify" || currentState === "success") {
        setState(currentState);
      } else {
        setState("error");
      }
    }
  };

  // Loading sequence
  const [loadingText, setLoadingText] = useState("Translating your workflow into hardware constraints...");

  useEffect(() => {
    if (state === "loading") {
      const timer = setTimeout(() => {
        setLoadingText("Scanning product matrices...");
      }, 3000);
      return () => clearTimeout(timer);
    } else {
      setLoadingText("Translating your workflow into hardware constraints...");
    }
  }, [state]);

  const handleSubmit = async () => {
    if (!query.trim()) return;
    setState("loading");
    setErrorMessage("");
    setResult(null);
    setClarifyData(null);
    setContext(query); // Initialize stateless context memory
    setLocalProfile({});
    setClarifySubmitCount(0);

    try {
      const res = await fetch("/api/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });
      const data = await res.json();
      handleAPIResponse(data, "idle");
    } catch (err) {
      setErrorMessage("Network error connecting to SpecSync. Please try again.");
      setState("error");
    }
  };

  const handleClarifySubmit = async () => {
    if (!clarifyInput.trim()) return;
    setState("loading");
    setErrorMessage("");

    const currentCount = clarifySubmitCount + 1;
    setClarifySubmitCount(currentCount);

    const nextContext = `${context} | User added context: ${clarifyInput}`;
    setContext(nextContext);
    setClarifyInput("");

    try {
      const res = await fetch("/api/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: nextContext, localProfile, new_text: clarifyInput }),
      });
      const data = await res.json();

      // Progressive Throttling: Force bubble selection if user avoids picking 2 times
      if (data.status === "clarify" && currentCount >= 2) {
        const missingFields = ["budget", "compute_intensity"].filter(k => !localProfile[k]);
        if (missingFields.length > 0) {
          const nextMissing = missingFields[0] as "budget" | "compute_intensity";
          setClarifyData({
            ...HARDCODED_CLARIFY[nextMissing],
            found_signals: data.found_signals || []
          });
          setErrorMessage("Let's hard-lock this before moving forward. Please select one of the following:");
          setState("clarify");
          return;
        }
      }

      handleAPIResponse(data, "clarify");
    } catch (err) {
      setErrorMessage("Network error connecting to SpecSync. Please try again.");
      setState("error");
    }
  };

  const handleCapsuleClick = async (capsule: { text: string, key: string, value: any }) => {
    setErrorMessage("");

    const updatedProfile = { ...localProfile, [capsule.key]: capsule.value };
    setLocalProfile(updatedProfile);

    const nextContext = `${context} | User selected: ${capsule.text}`;
    setContext(nextContext);

    const missingFields = ["budget", "compute_intensity"].filter(k => !updatedProfile[k]);

    // ZERO API CALL BYPASS
    if (missingFields.length > 0) {
      const nextMissing = missingFields[0] as "budget" | "compute_intensity";
      setClarifyData({
        ...HARDCODED_CLARIFY[nextMissing],
        found_signals: Object.entries(updatedProfile).map(([k, v]) => ({ signal: k, value: String(v), icon: "Laptop" }))
      });
      setClarifySubmitCount(0);
      return;
    }

    // Gatekeeper Execution
    setState("loading");
    setClarifySubmitCount(0);

    try {
      const res = await fetch("/api/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: nextContext, constraints: updatedProfile, localProfile: updatedProfile }),
      });
      const data = await res.json();
      handleAPIResponse(data, "clarify");
    } catch (err) {
      setErrorMessage("Network error connecting to SpecSync. Please try again.");
      setState("error");
    }
  };

  const handleRefinementSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!refinementInput.trim()) return;

    setState("loading");
    setErrorMessage("");

    const nextContext = `${context} | User added constraint: ${refinementInput}`;
    setContext(nextContext);
    setRefinementInput("");

    try {
      const res = await fetch("/api/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: nextContext }),
      });
      const data = await res.json();
      handleAPIResponse(data, "success");
    } catch (err) {
      setErrorMessage("Network error connecting to SpecSync. Please try again.");
      setState("error");
    }
  };

  const handleShare = () => {
    navigator.clipboard.writeText(
      `SpecSync recommends the ${result?.results?.find((r: any) => r.tier_type === 'recommended')?.product?.name} for me because: ${result?.results?.find((r: any) => r.tier_type === 'recommended')?.tradeoff_summary}`
    );
    setToastMessage("Copied to clipboard!");
    setTimeout(() => setToastMessage(""), 3000);
  };

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-6 sm:p-12">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 bg-zinc-900 text-white px-4 py-2 rounded-full text-sm font-medium shadow-lg z-50 animate-in fade-in slide-in-from-top-4 duration-300">
          {toastMessage}
        </div>
      )}

      <div className={cn(
        "w-full transition-all duration-500",
        state === "success" ? "max-w-7xl space-y-12" : "max-w-2xl space-y-8"
      )}>
        {/* Header */}
        <div className="text-center space-y-3">
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900 flex items-center justify-center gap-2">
            SpecSync
          </h1>
          <p className="text-lg sm:text-xl text-zinc-500 font-medium max-w-lg mx-auto leading-relaxed">
            Don't buy specs. Buy the machine that syncs with your life.
          </p>
        </div>

        {/* State: IDLE or ERROR */}
        {(state === "idle" || state === "error") && (
          <div className="bg-white border border-zinc-200 shadow-sm rounded-xl p-6 sm:p-8 space-y-6">
            {state === "error" && (
              <div className="bg-amber-50 border border-amber-200 p-5 rounded-xl flex items-start gap-4 text-sm text-amber-900 shadow-sm transition-all">
                <Lightbulb className="w-5 h-5 shrink-0 text-amber-600 mt-0.5" />
                <p className="leading-relaxed font-medium">{errorMessage}</p>
              </div>
            )}

            <div className="space-y-4">
              <textarea
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Describe your workflow, anxieties, or daily habits. (e.g. 'I'm a designer who travels a lot and keeps 50 Chrome tabs open...')"
                className="w-full h-40 p-4 bg-zinc-50 border border-zinc-200 rounded-lg text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:border-transparent resize-none leading-relaxed transition-all"
              />

              <div className="flex flex-wrap gap-2">
                {PILLS.map((pill) => (
                  <button
                    key={pill}
                    onClick={() => setQuery(prev => prev ? `${prev} ${pill}` : pill)}
                    className="px-3 py-1.5 bg-zinc-50 hover:bg-zinc-100 border border-zinc-200 hover:border-zinc-300 rounded-full text-xs font-medium text-zinc-600 transition-colors cursor-pointer"
                  >
                    {pill}
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={handleSubmit}
              disabled={!query.trim()}
              className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-zinc-300 disabled:cursor-not-allowed text-white font-medium py-3 sm:py-4 rounded-lg transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-md"
            >
              Translate Needs to Specs
            </button>
          </div>
        )}

        {/* State: LOADING */}
        {state === "loading" && (
          <div className="bg-white border border-zinc-200 shadow-sm rounded-xl p-12 flex flex-col items-center justify-center text-center space-y-6 animate-pulse">
            <RefreshCcw className="w-8 h-8 text-zinc-400 animate-spin" />
            <p className="text-zinc-600 font-medium">
              {loadingText}
            </p>
          </div>
        )}

        {/* State: CLARIFY */}
        {state === "clarify" && clarifyData && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {errorMessage && (
              <div className="bg-amber-50 border border-amber-200 p-5 rounded-xl flex items-start gap-4 text-sm text-amber-900 shadow-sm mx-auto max-w-2xl">
                <Lightbulb className="w-5 h-5 shrink-0 text-amber-600 mt-0.5" />
                <p className="leading-relaxed font-medium">{errorMessage}</p>
              </div>
            )}

            <div className="bg-white border border-zinc-200 shadow-sm rounded-xl p-6 sm:p-8 space-y-8">
              {/* Found Signals */}
              <div className="space-y-4 border-b border-zinc-100 pb-8">
                <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest text-center">Signals Detected</p>
                <div className="flex flex-wrap justify-center gap-3">
                  {clarifyData.found_signals?.map((sig: any, idx: number) => {
                    const Icon = ICON_MAP[sig.icon] || Laptop;
                    return (
                      <div key={idx} className="bg-zinc-100 border border-zinc-200 text-zinc-800 rounded-md px-3 py-1.5 text-sm font-medium flex items-center gap-2 shadow-sm">
                        <Icon className="w-4 h-4 text-zinc-500" />
                        <span><span className="text-zinc-500 font-normal mr-1">{sig.signal}:</span>{sig.value}</span>
                      </div>
                    )
                  })}
                </div>
              </div>

              <div className="space-y-6 text-center w-full max-w-xl mx-auto">
                <h2 className="text-xl sm:text-2xl font-bold text-zinc-900 leading-snug">{clarifyData.question}</h2>

                {/* Quick Reply Capsules */}
                {clarifyData.suggested_answers?.length > 0 && (
                  <div className="flex flex-wrap justify-center gap-3 py-2">
                    {clarifyData.suggested_answers.map((answer: any, idx: number) => (
                      <button
                        key={idx}
                        onClick={() => handleCapsuleClick(answer)}
                        className="bg-white border border-zinc-200 hover:bg-zinc-50 rounded-full px-4 py-2 text-sm font-medium text-zinc-700 transition-colors shadow-sm cursor-pointer"
                      >
                        {answer.text}
                      </button>
                    ))}
                  </div>
                )}

                <div className="pt-4 border-t border-zinc-100 flex flex-col gap-4">
                  <p className="text-xs font-semibold text-zinc-400 uppercase tracking-widest">Or type your own...</p>
                  <textarea
                    value={clarifyInput}
                    onChange={(e) => setClarifyInput(e.target.value)}
                    placeholder="e.g., 'Actually, my strict max is $1,200.'"
                    className="w-full h-32 p-4 bg-zinc-50 border border-zinc-200 rounded-lg text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:border-transparent resize-none leading-relaxed transition-all text-center"
                  />
                  <button
                    onClick={handleClarifySubmit}
                    disabled={!clarifyInput.trim()}
                    className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-zinc-300 disabled:cursor-not-allowed text-white font-medium py-3 sm:py-4 rounded-lg transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-md"
                  >
                    Update Requirements
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* State: SUCCESS */}
        {
          state === "success" && result?.results && (
            <div className="w-full flex flex-col items-center animate-in fade-in slide-in-from-bottom-4 duration-500">
              {errorMessage && (
                <div className="bg-amber-50 border border-amber-200 p-5 rounded-xl flex items-start gap-4 text-sm text-amber-900 shadow-sm mb-6 w-full max-w-2xl">
                  <Lightbulb className="w-5 h-5 shrink-0 text-amber-600 mt-0.5" />
                  <p className="leading-relaxed font-medium">{errorMessage}</p>
                </div>
              )}

              {/* The Locked Profile Banner */}
              {Object.keys(cumulativeProfile).length > 0 && (
                <div className="bg-indigo-50/50 rounded-xl p-4 mb-6 flex flex-col items-center gap-3 w-full max-w-2xl border border-indigo-100 shadow-sm">
                  <p className="text-xs text-indigo-400 font-semibold tracking-wider uppercase">Locked Constraints</p>
                  <div className="flex flex-wrap justify-center gap-2">
                    {Object.entries(cumulativeProfile).map(([label, value], idx: number) => (
                      <div key={idx} className="bg-white text-zinc-700 shadow-sm border border-indigo-100 px-3 py-1.5 rounded-md text-sm font-medium">
                        <span className="text-indigo-400 font-normal mr-1">{label}:</span>
                        {value as string}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Iterative Refinement Bar */}
              <div className="w-full max-w-2xl mb-12 bg-white border border-indigo-100 rounded-xl shadow-sm p-6 relative">
                <span className="absolute -top-3 left-6 bg-indigo-600 text-white text-[10px] uppercase font-bold tracking-widest px-3 py-1 rounded-full shadow-sm">
                  Fine-tune Results
                </span>
                <form onSubmit={handleRefinementSubmit} className="flex flex-col sm:flex-row gap-4 mt-2">
                  <input
                    type="text"
                    value={refinementInput}
                    onChange={(e) => setRefinementInput(e.target.value)}
                    placeholder="e.g., Actually, I need a Mac under $1800..."
                    className="w-full bg-zinc-50 border border-zinc-200 rounded-lg px-4 py-3 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all"
                  />
                  <button
                    type="submit"
                    disabled={!refinementInput.trim()}
                    className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white font-medium px-6 py-3 rounded-lg text-sm transition-colors whitespace-nowrap shadow-sm cursor-pointer disabled:cursor-not-allowed"
                  >
                    Update Requirements
                  </button>
                </form>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start w-full max-w-7xl mx-auto -mx-8 sm:mx-0 pr-8 sm:pr-0 pl-8 sm:pl-0">
                {result.results.map((item: any, idx: number) => {
                  const isRecommended = item.tier_type === "recommended";

                  return (
                    <div
                      key={idx}
                      className={cn(
                        "bg-white rounded-xl overflow-hidden flex flex-col h-full relative transition-all duration-300 hover:shadow-xl hover:scale-[1.02]",
                        isRecommended
                          ? "border border-zinc-200 border-t-[2px] border-t-emerald-600 shadow-md md:-mt-4 md:mb-4 z-10"
                          : "border border-zinc-200 shadow-sm opacity-90 hover:opacity-100"
                      )}
                    >
                      {isRecommended && (
                        <div className="bg-emerald-600 text-white text-xs font-bold uppercase tracking-wider text-center py-1.5 w-full">
                          Best Match
                        </div>
                      )}

                      {item.tier_type === "premium" && (
                        <div className="bg-zinc-100 text-zinc-600 text-[10px] font-bold uppercase tracking-wider text-center py-1 w-full border-b border-zinc-200">
                          Premium Upgrade
                        </div>
                      )}

                      {item.tier_type === "budget" && (
                        <div className="bg-zinc-100 text-zinc-600 text-[10px] font-bold uppercase tracking-wider text-center py-1 w-full border-b border-zinc-200">
                          Budget Pick
                        </div>
                      )}

                      {/* Top Section: The Machine */}
                      <div className="p-4 sm:p-5 border-b border-zinc-100 flex flex-col items-center text-center">
                        <div className="w-full aspect-[4/3] bg-zinc-50 rounded-lg border border-zinc-200 flex items-center justify-center p-4 overflow-hidden relative group mb-4">
                          <img
                            src={item.product?.image_url}
                            alt={item.product?.name}
                            className="w-full h-full object-contain opacity-80 mix-blend-multiply group-hover:opacity-100 transition-opacity"
                            onError={(e) => {
                              e.currentTarget.style.display = 'none';
                              e.currentTarget.parentElement?.querySelector('.fallback')?.classList.remove('hidden');
                            }}
                          />
                          <div className="fallback hidden w-full h-full absolute inset-0 flex flex-col items-center justify-center text-zinc-300">
                            <Laptop className="w-12 h-12 mb-2" />
                          </div>
                        </div>
                        <div className="space-y-1 w-full">
                          <p className="text-xs font-bold text-zinc-500 uppercase tracking-wide">{item.product?.brand}</p>
                          <h2 className={cn("font-bold text-zinc-900 line-clamp-2", isRecommended ? "text-xl" : "text-lg")}>
                            {item.product?.name}
                          </h2>
                          <p className={cn("font-medium text-zinc-900 pt-1", isRecommended ? "text-lg" : "text-base")}>
                            ${item.product?.price}
                          </p>
                        </div>
                      </div>

                      {/* Middle Section: The Tradeoff Summary */}
                      <div className="p-4 sm:p-5 bg-zinc-50/50 border-b border-zinc-100 flex-grow">
                        <p className="text-zinc-600 text-sm leading-relaxed italic whitespace-pre-line">
                          {highlightTradeoff(item.tradeoff_summary)}
                        </p>
                      </div>

                      {/* Bottom Section: Translation Badges */}
                      <div className="p-4 sm:p-5 flex flex-col gap-3 border-b border-zinc-100 bg-zinc-50/30">
                        {item.badges?.map((badge: any, i: number) => (
                          <div key={i} className="bg-white border border-zinc-200 rounded-md p-2.5 hover:border-zinc-300 transition-colors">
                            <p className="font-semibold text-zinc-900 text-xs mb-0.5">{badge.spec}</p>
                            <p className="text-[11px] text-zinc-500 font-medium leading-tight">{badge.reason}</p>
                          </div>
                        ))}
                      </div>

                      {/* Footer: PLG button */}
                      <div className="p-4 sm:p-5 pb-5 mt-auto bg-white">
                        <button
                          onClick={handleShare}
                          className="w-full cursor-pointer bg-white hover:bg-indigo-50 border border-indigo-200 text-indigo-600 font-medium py-2.5 rounded-lg transition-colors flex items-center justify-center gap-2 shadow-sm text-sm"
                        >
                          <Share className="w-3.5 h-3.5" />
                          Share Justification
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="w-full flex justify-center mt-8 animate-in fade-in duration-500">
                <button
                  onClick={() => { setState("idle"); setQuery(""); }}
                  className="cursor-pointer text-center text-sm text-zinc-500 hover:text-zinc-900 transition-colors font-medium"
                >
                  Start over
                </button>
              </div>
            </div>
          )}

      </div>
    </main>
  );
}
