import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { validateProfile, ExtractedProfile } from '../../../lib/validation';
import { generateWithFallback } from '../../../utils/aiRouter';

export async function POST(request: Request) {
    try {
        if (!process.env.GEMINI_API_KEY || !process.env.GROQ_API_KEY) {
            return NextResponse.json({ status: 'error', message: 'API keys are missing. Please configure GEMINI_API_KEY and GROQ_API_KEY.' }, { status: 500 });
        }

        const { query, constraints: incomingConstraints, localProfile, new_text } = await request.json();

        if (!query && !incomingConstraints && !new_text) {
            return NextResponse.json({ status: 'missing_info', message: 'Please provide some details about what you need.' });
        }

        // 1. Load the products database
        const dataPath = path.join(process.cwd(), 'data', 'products.json');
        let productsData: any[] = [];
        try {
            productsData = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
        } catch (e) {
            console.error("Could not load products.json", e);
            return NextResponse.json({ status: 'error', message: 'Internal server error: Database missing' }, { status: 500 });
        }

        // Agent 1: The Extractor (Gemini JSON)
        const extractionSchema = {
            type: "object",
            properties: {
                status: {
                    type: "string",
                    enum: ["success", "conflict", "clarify"],
                    description: "If constraints contradict severely, return 'conflict'. If 'budget' or 'compute_intensity' cannot be confidently inferred, return 'clarify'. Return 'success' if BOTH budget and compute_intensity are known. Do NOT return clarify for mobility, os_preference, or storage_habits; just infer them if possible."
                },
                message: {
                    type: "string",
                    description: "Message for the user explaining the conflict. Used only if status is 'conflict'."
                },
                question: {
                    type: "string",
                    description: "A punchy, consultative question asking the user ONLY for the missing budget or compute_intensity. MUST be under 15 words. Required if status is 'clarify'."
                },
                suggested_answers: {
                    type: "array",
                    description: "3 to 4 highly relevant, short clickable options based on the question. Required if status is 'clarify'.",
                    items: {
                        type: "object",
                        properties: {
                            text: { type: "string", description: "The user-facing pill text (e.g., 'Under $1000', 'Heavy (Video Editing)')" },
                            key: { type: "string", description: "The exact constraint key this answers (e.g., 'budget', 'compute_intensity')" },
                            value: { type: "string", description: "The structured value to save (e.g., '1000', 'Heavy')" }
                        },
                        required: ["text", "key", "value"]
                    }
                },
                found_signals: {
                    type: "array",
                    description: "List of the signals already identified from the user input. Required if status is 'clarify'.",
                    items: {
                        type: "object",
                        properties: {
                            signal: { type: "string", description: "One of: budget, compute_intensity, mobility, os_preference, storage_habits" },
                            value: { type: "string", description: "What the user stated or implicitly needs (e.g., 'Mac Only', 'Lots of 4K video')" },
                            icon: { type: "string", description: "A relevant Lucide react icon name (e.g., 'Coins', 'Zap', 'Globe', 'Laptop', 'HardDrive')" }
                        },
                        required: ["signal", "value", "icon"]
                    }
                },
                constraints: {
                    type: "object",
                    description: "Populate only if status is 'success'.",
                    properties: {
                        workflow: { type: "array", items: { type: "string" } },
                        os_preference: { type: "string", enum: ["Windows", "macOS", "ChromeOS", "Any"] },
                        budget: { type: "number", description: "If the user has no strict limit, output 10000." },
                        storage_gb: { type: "number" },
                        form_factor: { type: "string", enum: ["Fanless", "Standard", "Ultra-light/Thin", "Workstation"] },
                        battery_preference_hours: { type: "number" },
                        min_ram_gb: { type: "number" },
                        max_weight_lbs: { type: "number" },
                        max_price: { type: "number" },
                        min_storage_gb: { type: "number" }
                    }
                },
                final_profile: {
                    type: "array",
                    description: "Populate only if status is 'success'. A user-friendly summary of the locked constraints derived from the context (e.g. Budget, Compute Type, OS Preference).",
                    items: {
                        type: "object",
                        properties: {
                            label: { type: "string", description: "The constraint category, e.g. 'Compute', 'Budget', 'OS'" },
                            value: { type: "string", description: "The translated constraint, e.g. 'Heavy (Local AI)', 'Max $1500', 'macOS Only'" }
                        },
                        required: ["label", "value"]
                    }
                }
            },
            required: ["status"],
        };

        const extractionPrompt = `You are a warm, empathetic, and polite high-end technical concierge. Your goal is to translate the user’s messy, human anxieties into structured constraints.
We explicitly require only 2 signals to make a recommendation: budget and compute_intensity.
Never trigger a clarify loop for mobility, os_preference, or storage_habits. Just infer those in the constraints if possible.
If both budget and compute_intensity are confident, return status 'success' and extract realistic constraints.

STRICT STATE BOUNDARIES (NO HAGGLING):
1. The 'clarify' Rule: You MUST ONLY trigger the 'clarify' state if the budget or compute_intensity is completely missing. If the user explicitly states "no strict limit" or "unlimited budget", set their budget to 10000 and naturally proceed to 'success', DO NOT ask to clarify again. Prefix your question with a gentle conversational nudge (e.g., 'I\\'d love to find the perfect match for you. To make sure it handles your workflow without a hitch, what is your maximum budget?'). You are STRICTLY FORBIDDEN from using this state to haggle or ask the user to increase a budget they have already provided. Include 3-4 clickable 'suggested_answers' that ONLY answer the specific missing constraint you are asking about (e.g. if asking for budget, ONLY provide budget options. Do NOT mix budget and compute options). Populate 'found_signals' with ALL historical and newly identified signals you know from the entire conversation history.

CRITICAL RECENCY BIAS: Pay strict attention to the chronological history of the user's input. The text appended at the very end (marked by 'User added constraint:') is the most recent and MUST override any conflicting previous constraints. If the user explicitly adds an OS preference, storage requirement, or alters their budget in that appended text, update the extracted JSON constraints and the final_profile array to reflect these new realities.

CRITICAL JSON RULES: You MUST respond purely in valid JSON format. Do not include markdown blocks or any other text.
Your response MUST exactly match the structure of the following JSON Schema:
${JSON.stringify(extractionSchema, null, 2)}`;

        let parsedResponse: any;

        if (incomingConstraints) {
            parsedResponse = {
                status: 'success',
                constraints: incomingConstraints,
                final_profile: Object.entries(localProfile || {}).map(([k, v]) => ({ label: k, value: String(v) }))
            };
        } else {
            let userContent = `User Query / Conversational History: "${query}"`;
            if (localProfile && Object.keys(localProfile).length > 0 && new_text) {
                userContent = `CURRENT PROFILE (Already Identified Constraints): ${JSON.stringify(localProfile)}\nNEW USER TEXT: "${new_text}"\nUpdate the profile based on the new text. Keep all existing constraints from the current profile unless the new text explicitly contradicts them.`;
            }

            const prompt = `${extractionPrompt}\n\n${userContent}`;
            parsedResponse = await generateWithFallback(prompt, extractionSchema, 0.1);
        }

        if (parsedResponse.status === 'clarify') {
            return NextResponse.json(parsedResponse);
        }

        const constraints = parsedResponse.constraints || incomingConstraints || {};

        let violation_reports: any[] = [];
        if (parsedResponse.status === 'success') {
            violation_reports = validateProfile(constraints as ExtractedProfile, query || new_text || "");
            const conflictReport = violation_reports.find(v => v.severity === "CONFLICT");
            if (conflictReport) {
                return NextResponse.json({
                    status: 'conflict',
                    message: conflictReport.technical_educational_message,
                    violation_reports
                }, { status: 400 });
            }
        }

        // 2. Score and select 3 tiers
        const scoredLaptops = productsData.map(laptop => {
            let score = 0;

            const ramMatch = laptop.specs.RAM.match(/(\d+)/);
            const ram = ramMatch ? parseInt(ramMatch[1]) : 8;
            if (constraints.min_ram_gb) {
                if (ram >= constraints.min_ram_gb) score += 10;
                else score -= 50;
            } else {
                score += ram * 0.1;
            }

            if (constraints.max_price) {
                if (laptop.price <= constraints.max_price) score += 10;
                else score -= 100;
            }

            const weightMatch = laptop.specs.Weight.match(/([\d\.]+)/);
            const weight = weightMatch ? parseFloat(weightMatch[1]) : 5;
            if (constraints.max_weight_lbs) {
                if (weight <= constraints.max_weight_lbs) score += 5;
                else score -= 10;
            }

            const isMac = laptop.brand === 'Apple';
            const isChrome = laptop.name.toLowerCase().includes('chromebook');
            const isWindows = !isMac && !isChrome;

            if (constraints.os_preference && constraints.os_preference !== 'Any') {
                if (constraints.os_preference === 'macOS' && isMac) score += 20;
                else if (constraints.os_preference === 'Windows' && isWindows) score += 20;
                else if (constraints.os_preference === 'ChromeOS' && isChrome) score += 20;
                else score -= 40;
            }

            const keywords = (query || new_text || "").toLowerCase().split(' ');
            laptop.target_persona.forEach((persona: string) => {
                const pLower = persona.toLowerCase();
                keywords.forEach((kw: string) => {
                    if (kw.length > 3 && pLower.includes(kw)) score += 2;
                });
            });

            // The Mobile Dev Reality: Hard Filter ChromeOS
            const hasMobileDev = ["android", "studio", "cocos", "ide", "engine"].some(kw => keywords.includes(kw));
            if (isChrome && (hasMobileDev || constraints.compute_intensity === "Heavy" || constraints.compute_intensity === "Intense")) {
                score -= 9999;
            }

            return { ...laptop, _score: score };
        });

        // Pull final profile from Agent 1
        const finalProfile = parsedResponse.final_profile || [];
        const userBudget = constraints.budget || 10000;

        // 1. The 20% Hard Flex Limit Ceiling
        // First, immediately filter out any machine that exceeds the 20% flex room.
        const validLaptops = scoredLaptops.filter(laptop => laptop.price <= userBudget * 1.20);

        // Filter out severely mismatched compute machines (negative scores)
        const viableLaptops = validLaptops.filter(laptop => laptop._score >= 0);

        // 2. The Empty State / Conflict Trigger
        // If the combination of strict budget ceilings and compute failures yields 0 machines, abort.
        if (viableLaptops.length === 0) {
            return NextResponse.json({
                status: 'conflict', // Instantly triggers the Amber UI card without Agent 2
                message: `There are no machines under your $${userBudget} limit that can handle your heavy workflow without crashing. Please use the Fine-Tune bar to increase your budget or lower your compute needs.`
            });
        }

        // Sort the survivors by their performance scores
        viableLaptops.sort((a, b) => b._score - a._score);

        // 3. Tier Strictness Allocation
        // The Recommended and Budget picks MUST be strictly <= the locked budget
        const strictCandidates = viableLaptops.filter(laptop => laptop.price <= userBudget);

        // If even the strict candidates list is completely empty, we must abort because we cannot fulfill the Best Match rule.
        if (strictCandidates.length === 0) {
            return NextResponse.json({
                status: 'conflict',
                message: `There are no machines under your $${userBudget} limit that can handle your heavy workflow without crashing. Please use the Fine-Tune bar to increase your budget or lower your compute needs.`
            });
        }

        // Recommended (Best Match) MUST be from the strict list
        const recommended = strictCandidates[0];

        // Budget MUST also be from the strict list and cheaper than Best Match
        const budgetCandidates = strictCandidates.filter(l => l.price < recommended.price && l.id !== recommended.id);
        const budget = budgetCandidates.length > 0 ? budgetCandidates[0] : null;

        // Premium Upgrade is allowed to use the remaining viable pool (which includes the 1.20 flex room)
        const premiumCandidates = viableLaptops.filter(l => l.price > recommended.price && l.id !== recommended.id);
        const premium = premiumCandidates.length > 0 ? premiumCandidates[0] : null;

        const finalCandidates = [
            { tier: "recommended", laptop: recommended, price_difference: userBudget - recommended.price },
            ...(budget ? [{ tier: "budget", laptop: budget, price_difference: userBudget - budget.price }] : []),
            ...(premium ? [{ tier: "premium", laptop: premium, price_difference: userBudget - premium.price }] : [])
        ];

        // Agent 2: The Closer (Gemini JSON)
        const closerSchema = {
            type: "object",
            properties: {
                recommendations: {
                    type: "array",
                    description: "Provide consultative pitches for the exactly provided laptops depending on their tier.",
                    items: {
                        type: "object",
                        properties: {
                            tier_type: { type: "string", enum: ["budget", "recommended", "premium"] },
                            product_id: { type: "string", description: "The EXACT id of the laptop evaluated." },
                            tradeoff_summary: { type: "string", description: "A highly consultative, expert trade-off summary (max 3 sentences) comparing the machine specs/price to to the user's constraints." },
                            badges: {
                                type: "array",
                                items: {
                                    type: "object",
                                    properties: {
                                        spec: { type: "string" },
                                        reason: { type: "string" }
                                    },
                                    required: ["spec", "reason"],
                                }
                            }
                        },
                        required: ["tier_type", "product_id", "tradeoff_summary", "badges"],
                    }
                }
            },
            required: ["recommendations"],
        };

        const closerPrompt = `You are an expert, consultative hardware salesperson. You must write persuasive, highly tailored summaries for the provided laptops based on the user's explicit locked constraints. 
Link hard specifications back to the user's stated behavioral needs and anxieties in the badges.

WARNING INJECTION: If a ViolationReport with severity 'WARNING' exists in the input, you MUST prepend a bolded "**CONSULTANT'S NOTE:**" to the tradeoff_summary addressing that specific risk (e.g., Mac gaming limitations or thermal throttling).

RECENT-CONSTRAINT PIVOT: The machine justification must lead with the user's most recently added requirement (the last segment of the history string) to prove the system is responding to their iteration.

CRITICAL CONSULTATIVE DIRECTIVE: Your \`tradeoff_summary\` MUST be a maximum of 3 sentences (excluding the Consultant's Note). You will be provided a \`price_difference\` integer for each machine. You MUST use this exact mathematical figure when discussing savings or ROI. You are strictly forbidden from inventing, calculating, or estimating your own savings numbers. You are strictly forbidden from referencing a 'recommended budget'. You MUST explicitly compare the selected machine's specs and price against the user's final_profile constraints.

CRITICAL JSON RULES: You MUST respond purely in valid JSON format. Do not include markdown blocks or any other text.
Your response MUST exactly match the structure of the following JSON Schema:
${JSON.stringify(closerSchema, null, 2)}`;

        const closerUserPromt = `User Locked Constraints/Anxieties: "${query}"\nViolation Reports (WARNINGS): ${JSON.stringify(violation_reports || [])}\n\nLaptops to Pitch:\n${JSON.stringify(finalCandidates.map(c => ({ tier: c.tier, ...c.laptop })), null, 2)}`;
        const pitchResponse = await generateWithFallback(`${closerPrompt}\n\n${closerUserPromt}`, closerSchema, 0.2);

        const parsedCloser = pitchResponse || {};
        const enrichedRecommendations = parsedCloser.recommendations?.map((rec: any) => {
            const fullProduct = productsData.find(p => p.id === rec.product_id);
            return {
                ...rec,
                product: fullProduct || recommended // fallback just in case
            }
        }) || [];

        return NextResponse.json({
            status: 'success',
            results: enrichedRecommendations,
            final_profile: finalProfile,
            violation_reports: violation_reports || []
        });

    } catch (error: any) {
        console.error("Recommendation API Error:", error);

        // Give a clear UI message if it completely exhausts retries (all 4 models failed)
        const isRateLimit = error.status === 429 || (error.message && error.message.includes('429'));
        if (isRateLimit) {
            return NextResponse.json({ status: 'error', message: "AI API is receiving too many requests across all fallback models. Please wait a moment and try again." }, { status: 429 });
        }

        if (error.message?.includes("Waterfall Exhausted")) {
            return NextResponse.json({ status: 'error', message: "All AI fallback models timed out or failed. Please try again." }, { status: 503 });
        }

        return NextResponse.json({ status: 'error', message: "Something went wrong while consulting the AI.", details: error.message }, { status: 500 });
    }
}
