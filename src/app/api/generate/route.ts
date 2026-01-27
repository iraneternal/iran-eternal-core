export const runtime = 'nodejs';

import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

export async function POST(req: Request) {
  try {
    const { repName, userCity, country, topic, tone, userName, userAddress, userPhone } = await req.json();

    const globalContext = `
      CONTEXT: All events are occurring in Iran amid widespread, ongoing protests for freedom. 
      The situation is a revolutionary climate where the state is using lethal force against its own citizens and committing mass murder.
      STATUS: The internet blackout starting Jan 8th is ONGOING and actively used to mask these atrocities.
    `;

    const model = genAI.getGenerativeModel({ 
        model: "gemini-2.5-flash-lite", 
        generationConfig: { responseMimeType: "application/json" }
    });

    // --- Country Specific Logic ---
    let roleDescription = "Constituent";
    let targetTitle = "MP";
    let languageInstruction = "Language: English (US/UK/Canada standard).";
    let salutationInstruction = "Use a formal and respectful salutation (e.g., 'Dear [Title] [Name]').";

    if (country === 'US') {
        targetTitle = "Representative/Senator";
        roleDescription = "American Voter";
    } else if (country === 'UK') {
        targetTitle = "Member of Parliament";
        roleDescription = "British Resident";
    } else if (country === 'DE') {
        targetTitle = "Mitglied des Bundestages";
        roleDescription = "German Citizen";
        languageInstruction = "Language: German (Formal, Polite, Official - 'Sie' form).";
        salutationInstruction = "Use the formal German salutation: 'Sehr geehrte Frau [Name]' or 'Sehr geehrter Herr [Name]'.";
    } else if (country === 'FR') {
        targetTitle = "Député(e)";
        roleDescription = "French Citizen";
        languageInstruction = "Language: French (Formal, polite, using 'vous' form throughout).";
        salutationInstruction = "Use the formal French salutation: 'Madame la Députée' or 'Monsieur le Député'.";
    } else if (country === 'SE') {
        targetTitle = "Riksdagsledamot";
        roleDescription = "Swedish Citizen";
        languageInstruction = "Language: Swedish (Formal, professional, respectful tone).";
        salutationInstruction = "Use the formal Swedish salutation: 'Ärade Riksdagsledamot [Name]' or 'Bäste/Bästa [Name]'.";
    } else if (country === 'AU') {
        targetTitle = "Member of Parliament/Senator";
        roleDescription = "Australian Resident";
        languageInstruction = "Language: English (Australian standard).";
        salutationInstruction = "Use a formal salutation: 'Dear [Title] [Name]' (e.g., 'Dear Senator Smith' or 'Dear Mr. Jones MP').";
    } else if (country === 'EU') {
        targetTitle = "Member of the European Parliament";
        roleDescription = "European Union Citizen";
        languageInstruction = "Language: English (formal, diplomatic, suitable for EU institutions).";
        salutationInstruction = "Use the formal salutation: 'Dear Member of the European Parliament [Name]' or 'Dear MEP [Name]'.";
    }

    // --- Politeness Protocol ---
    const politenessInstruction = `
      CRITICAL TONE INSTRUCTIONS:
      1. RESPECTFUL: The message MUST be polite, diplomatic, and respectful at all times.
      2. PERSUASIVE: Use persuasive language ("I urge you", "I respectfully request", "Please consider") rather than demands or attacks.
      3. PROFESSIONAL: Avoid all-caps, exclamation marks, or aggressive rhetoric. The goal is to build a bridge with the official, not to alienate them.
    `;

    // --- Topic Instructions ---
    let specificInstructions = "";
    if (topic.includes("IRGC") || topic.includes("Machinery of Repression")) {
      specificInstructions = "Tone: Urgent and authoritative. Urge the government to protect the people of Iran by weakening the regime's machinery of repression, especially by targeting the Islamic Revolutionary Guard Corps (IRGC), its commanders, its command structure, and its infrastructure. Emphasize that the IRGC is the regime's primary instrument of violence against its own people and must be sanctioned, designated as a terrorist organization where not already done, and its networks dismantled.";
    } else if (topic.includes("Massacre") || topic.includes("Killing")) {
      specificInstructions = "Tone: Urgent. CRITICAL: Reference the Bloomberg report citing the UN special rapporteur on human rights in Iran, who reported based on doctors inside the country that the death toll has now topped 30,000 (Source: https://time.com/7357635/more-than-30000-killed-in-iran-say-senior-officials/). Emphasize that the internet blackout (Jan 8 - Present) is being used to hide these mass killings.";
    } else if (topic.includes("Expel") || topic.includes("Diplomats")) {
      specificInstructions = "Tone: Firm and Principled. Explicitly state that the Islamic Republic has lost all legitimacy and does not represent the Iranian people. Argue that maintaining diplomatic relations normalizes a regime actively warring against its own citizens. Urge the government to expel the regime's diplomats and pursue legal action against perpetrators of crimes against humanity.";
    } else if (topic.includes("Internet") || topic.includes("Blackout")) {
      specificInstructions = "Tone: Urgent and Technical. Emphasize that the total internet blackout since Jan 8 is being used to hide mass killings. Urge the government to provide internet for Iran through Starlink and other secure communications tools, and to take action to disable the regime's ability to shut down the internet. Highlight that connectivity is essential for documenting human rights abuses and protecting civilians.";
    } else if (topic.includes("Economic") || topic.includes("Shadow Fleet")) {
      specificInstructions = "Tone: Firm and Strategic. Urge maximum economic pressure on the regime by blocking its assets around the world and targeting its clandestine network of oil tankers, known as the 'shadow fleet.' Emphasize that cutting off the regime's financial lifelines is essential to stopping its violence against the Iranian people.";
    } else if (topic.includes("Political Prisoners") || topic.includes("Free All")) {
      specificInstructions = "Tone: Urgent and Humanitarian. Demand the immediate and unconditional release of all political prisoners in Iran. Emphasize that thousands of peaceful protesters, journalists, activists, and human rights defenders are being detained, tortured, and executed simply for demanding their basic rights.";
    } else if (topic.includes("Democratic Transition") || topic.includes("Transitional Government")) {
      specificInstructions = "Tone: Forward-looking and Principled. Urge the government to prepare for a democratic transition in Iran and to recognize a legitimate transitional government that represents the will of the Iranian people. Emphasize that the international community must stand ready to support the Iranian people's aspirations for freedom and self-determination.";
    }

    // --- The Prompt ---
    const prompt = `
      Role: Advocacy writer for a ${roleDescription}.
      Task: Write a formal, polite, and persuasive email to ${targetTitle} ${repName} from a constituent in ${userCity || 'the country'}.
      
      ${languageInstruction}
      ${politenessInstruction}
      
      GLOBAL CONTEXT: ${globalContext}
      Topic: ${topic}. ${specificInstructions}
      
      Sender Details:
      Name: ${userName}
      Address: ${userAddress}
      
      Requirements:
      1. Subject: Professional and clear (e.g., "Urgent Request:...", "Concern regarding..."). Translate to local language and High impact (referencing "Ongoing Bloodshed" or "Active Blackout")
      2. Salutation: ${salutationInstruction}. Address all officials professionally (e.g., "Dear Senators and Representative," or list names if few).
      3. Body: 150-200 words in the target language. Clearly state the issue (Internet Blackout/Mass Killings) and respectfully ask for action. Explicitly state that the Internet and all communication blackout which started on Jan 8 is persistent and ongoing.
      4. Focus: The lack of connectivity is preventing the world from seeing the Mass Killings in real-time.
      5. Closing: Sign off professionally (e.g., "Sincerely", "Hochachtungsvoll", "Respectueusement", "Med vänlig hälsning") followed by Sender Details.
      6. Format: JSON { "subject": "str", "body": "str" }
      7. IMPORTANT: Use proper paragraph breaks (\\n\\n) between sections - salutation, each main paragraph, and closing. The body must NOT be one continuous block of text.
    `;

    const result = await model.generateContent(prompt);
    const text = result.response.text();
    const cleanJson = text.replace(/```json|```/g, "").trim();

    return NextResponse.json(JSON.parse(cleanJson));

  } catch (error: any) {
    return NextResponse.json({ error: "The AI service is currently unavailable. Please try again shortly." }, { status: 500 });
  }
}