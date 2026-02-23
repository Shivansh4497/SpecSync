export type Severity = "WARNING" | "CONFLICT";

export interface ViolationReport {
    severity: Severity;
    law_violated: string;
    technical_educational_message: string;
    resolutions?: { action: string; newValue: any; label: string }[];
}

export interface ExtractedProfile {
    workflow?: string[];
    os_preference?: string;
    budget?: number;
    storage_gb?: number;
    form_factor?: string;
    battery_preference_hours?: number;
}

export function validateProfile(profile: ExtractedProfile, rawQuery: string): ViolationReport[] {
    const violations: ViolationReport[] = [];
    const queryLower = rawQuery.toLowerCase();

    // Helper to check if workflow or raw query includes keywords
    const hasKeyword = (keywords: string[]) => {
        return keywords.some(kw =>
            queryLower.includes(kw.toLowerCase()) ||
            (profile.workflow && profile.workflow.some(w => w.toLowerCase().includes(kw.toLowerCase())))
        );
    };

    if (hasKeyword(["iOS", "Swift", "Xcode"]) && ["Windows", "ChromeOS"].includes(profile.os_preference || "")) {
        violations.push({
            severity: "CONFLICT",
            law_violated: "The iOS Dev Trap",
            technical_educational_message: "Developing iOS apps requires Xcode, which is strictly limited to macOS. I cannot recommend a Windows or ChromeOS machine for this workflow.",
            resolutions: [{ action: "UPDATE_OS", newValue: "macOS", label: "Switch to macOS" }]
        });
    }

    if (hasKeyword(["Local AI", "LLMs", "Stable Diffusion"]) && (profile.budget && profile.budget < 1500)) {
        violations.push({
            severity: "CONFLICT",
            law_violated: "The Local AI Budget Math",
            technical_educational_message: "Running local AI models requires at least 16GB (preferably 32GB) of unified memory or VRAM. It is physically impossible to find a machine under $1500 that won't crash under this load. Would you like to raise your budget or focus on cloud-AI machines?",
            resolutions: [{ action: "UPDATE_BUDGET", newValue: 1500, label: "Increase budget to $1500" }]
        });
    }

    // Rule 3: The ChromeOS Power Ceiling
    if (hasKeyword(["Video Editing", "3D Rendering", "Heavy Coding"]) && profile.os_preference === "ChromeOS") {
        violations.push({
            severity: "CONFLICT",
            law_violated: "The ChromeOS Power Ceiling",
            technical_educational_message: "ChromeOS is a web-based operating system and cannot natively run heavy local applications like Premiere Pro or Blender. We need to switch your preference to Windows or macOS.",
            resolutions: [
                { action: "UPDATE_OS", newValue: "Windows", label: "Switch to Windows" },
                { action: "UPDATE_OS", newValue: "macOS", label: "Switch to macOS" }
            ]
        });
    }

    // Rule 4: The Mac Gaming Reality
    if (hasKeyword(["AAA Gaming"]) && profile.os_preference === "macOS") {
        violations.push({
            severity: "WARNING",
            law_violated: "The Mac Gaming Reality",
            technical_educational_message: "While Apple Silicon is powerful, native support for major AAA games is severely limited. You will heavily rely on crossover tools like Game Porting Toolkit."
        });
    }

    // Rule 5: The 4K Storage Choke
    if (hasKeyword(["4K Video", "8K Video", "RAW Photography"]) && (profile.storage_gb && profile.storage_gb <= 512)) {
        violations.push({
            severity: "WARNING",
            law_violated: "The 4K Storage Choke",
            technical_educational_message: "4K video files will fill a 512GB drive in days. I am recommending these machines, but please budget for external SSDs."
        });
    }

    // Rule 6: The Fanless Render
    if (hasKeyword(["Heavy 3D", "Sustained Gaming", "Blender"]) && profile.form_factor === "Fanless") {
        violations.push({
            severity: "WARNING",
            law_violated: "The Fanless Render",
            technical_educational_message: "Fanless machines are silent but will severely thermal-throttle during sustained 3D rendering. Expect slower export times compared to actively cooled laptops."
        });
    }

    // Rule 7: The Physics of Gaming Battery
    if (hasKeyword(["Heavy Gaming"]) && (profile.battery_preference_hours && profile.battery_preference_hours >= 10)) {
        violations.push({
            severity: "WARNING",
            law_violated: "The Physics of Gaming Battery",
            technical_educational_message: "High-end laptop GPUs draw immense power. While these machines offer great performance, expect a maximum of 2-3 hours of battery life while actively gaming."
        });
    }

    // Rule 8: The Budget CAD Architect
    if (hasKeyword(["CAD", "SolidWorks", "Revit"]) && (profile.budget && profile.budget < 1000)) {
        violations.push({
            severity: "CONFLICT",
            law_violated: "The Budget CAD Architect",
            technical_educational_message: "Professional CAD software requires dedicated workstation GPUs to run smoothly. Sub-$1000 machines rely on integrated graphics, which will lead to severe lag. I advise raising the budget or looking at used workstations.",
            resolutions: [{ action: "UPDATE_BUDGET", newValue: 1000, label: "Increase budget to $1000" }]
        });
    }

    // Rule 9: The Mobile Dev Reality
    const hasDevKeywords = hasKeyword(["Android Studio", "Cocos", "IDE", "Game Engine", "Game Dev", "Heavy Compute", "Intense"]);
    if (hasDevKeywords && (profile.budget && profile.budget < 1200)) {
        violations.push({
            severity: "CONFLICT",
            law_violated: "The Mobile Dev Reality",
            technical_educational_message: "Running heavy IDEs and compiling game engines requires significant RAM and CPU power. It is impossible to recommend a machine under $1200 that will not severely bottleneck your development. Please increase your budget.",
            resolutions: [{ action: "UPDATE_BUDGET", newValue: 1200, label: "Increase budget to $1200" }]
        });
    }

    return violations;
}
