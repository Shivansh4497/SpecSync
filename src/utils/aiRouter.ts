import { GoogleGenAI } from '@google/genai';
import Groq from 'groq-sdk';

// Sanitization Helper
function sanitizeAndParseJSON(rawText: string): any {
    const sanitized = rawText.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim();
    return JSON.parse(sanitized);
}

let geminiAi: GoogleGenAI;
let groqAi: Groq;

export async function generateWithFallback(prompt: string, jsonSchema: any, temperature: number = 0.5): Promise<any> {
    if (!geminiAi) geminiAi = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    if (!groqAi) groqAi = new Groq({ apiKey: process.env.GROQ_API_KEY });

    const aiModels = [
        { provider: 'gemini', id: 'gemini-2.5-flash' },
        { provider: 'groq', id: 'llama-3.3-70b-versatile' },
        { provider: 'groq', id: 'llama-3.1-8b-instant' },
        { provider: 'groq', id: 'mixtral-8x7b-32768' }
    ];

    for (const model of aiModels) {
        // Latency Killer: 5-second AbortController
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);

        try {
            let rawText = '';

            if (model.provider === 'gemini') {
                const response = await (geminiAi.models as any).generateContent({
                    model: model.id,
                    contents: prompt,
                    config: {
                        responseMimeType: "application/json",
                        temperature: temperature
                    }
                }, { signal: controller.signal });

                rawText = response.text || '{}';
            } else if (model.provider === 'groq') {
                const response = await groqAi.chat.completions.create({
                    model: model.id,
                    messages: [
                        { role: 'system', content: `Please strictly return JSON matching this schema: ${JSON.stringify(jsonSchema)}` },
                        { role: 'user', content: prompt }
                    ],
                    response_format: { type: 'json_object' },
                    temperature: temperature,
                }, { signal: controller.signal as any });

                rawText = response.choices[0]?.message?.content || '{}';
            }

            clearTimeout(timeoutId);

            // Sanitization & Parsing
            return sanitizeAndParseJSON(rawText);

        } catch (error: any) {
            clearTimeout(timeoutId);

            // Error Status Filtering
            const isTimeout = error.name === 'AbortError' || error.message?.toLowerCase().includes('timeout') || error.message?.includes('aborted');
            const status = error.status || error.response?.status;

            // Halt Condition: Bad Request or Schema Validation Failure
            if (status === 400 || error.message?.includes('validation failed')) {
                console.error(`[aiRouter] Fatal 400 or Validation Error on ${model.id}. Halting waterfall.`);
                throw error;
            }

            // Proceed Condition: Timeout, Rate Limit, Server Error, or JSON Parse Failure
            const isRateLimit = status === 429 || error.message?.includes('429');
            const isServerError = status >= 500 && status < 600;
            const isParseError = error instanceof SyntaxError;

            if (isTimeout || isRateLimit || isServerError || isParseError) {
                console.warn(`[aiRouter] ${model.id} failed (${isTimeout ? 'Timeout' : status || 'Parse Error'}). Falling back to next model...`);
                continue;
            }

            // If it's a completely unknown error, throw it so we don't silently swallow critical bugs
            throw error;
        }
    }

    throw new Error("Waterfall Exhausted: All 4 models failed or timed out.");
}
