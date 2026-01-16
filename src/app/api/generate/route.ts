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
    if (topic.includes("Reza Pahlavi") || topic.includes("plenary")) {
      // Special handling for EU Reza Pahlavi invitation topic - rotate between 3 templates
      const templates = [
        // Template A: Formal & Direct
        {
          subject: "Request: Sign the letter to invite Reza Pahlavi to EU Parliament plenary",
          body: `Dear Member of the European Parliament,

I am writing to respectfully ask that you sign the letter initiated by MEP Sebastian Tynkkynen, addressed to President Roberta Metsola, calling for Reza Pahlavi to be invited to address the European Parliament plenary session.

The Iranian people are facing a severe crackdown by their government. Reza Pahlavi has emerged as a unifying voice for their aspirations for freedom and human rights.

The letter states: "It is time to hear from Reza Pahlavi. A figure whose name is chanted by Iranians in the streets... Silencing or sidelining voices they openly support undermines both our credibility and our stated commitment to human rights."

I kindly urge you to contact MEP Tynkkynen's office before the Friday 13:00 deadline to add your signature.

Respectfully,
${userName}
${userAddress}`
        },
        // Template B: Constituent Focus
        {
          subject: "Please support: Invite Reza Pahlavi to address EU Parliament",
          body: `Dear Member of the European Parliament,

As someone who cares deeply about human rights in Iran, I am reaching out to ask for your support.

MEP Sebastian Tynkkynen has initiated a letter to President Roberta Metsola requesting that Reza Pahlavi be given the opportunity to speak before the European Parliament plenary.

Reza Pahlavi is a voice that Iranians themselves have chosen to rally behind as they risk their lives protesting for basic freedoms. Inviting him would send a powerful message of solidarity.

I respectfully ask that you contact MEP Tynkkynen's office to add your signature before the deadline this Friday at 13:00.

Thank you for your time and consideration.

Sincerely,
${userName}
${userAddress}`
        },
        // Template C: Short & Urgent
        {
          subject: "Urgent: Please sign letter inviting Reza Pahlavi to EU Parliament",
          body: `Dear Member of the European Parliament,

I urge you to sign the letter initiated by MEP Sebastian Tynkkynen to invite Reza Pahlavi to address the European Parliament plenary.

Reza Pahlavi represents the voice of millions of Iranians fighting for their freedom. His address would be a meaningful show of European support for human rights.

The deadline to sign is Friday at 13:00. Please contact MEP Tynkkynen's office to add your signature.

Sincerely,
${userName}
${userAddress}`
        }
      ];

      // Randomly select one of the 3 templates
      const selectedTemplate = templates[Math.floor(Math.random() * templates.length)];

      return NextResponse.json({
        subject: selectedTemplate.subject,
        body: selectedTemplate.body
      });
    } else if (topic.includes("R2P")) {
      specificInstructions = "Tone: Urgent and authoritative. Formally invoke the '2005 UN World Summit Outcome resolution' (specifically paragraphs 138 and 139). Emphasize that when a state fails to protect its people from crimes against humanity, the international community must honor its collective commitment to intervene through diplomatic and economic pressure.";
    } else if (topic.includes("Massacre") || topic.includes("Killing")) {
      specificInstructions = "Tone: Urgent. CRITICAL: Reference the CBS News report confirming the death toll has surpassed 12,000 (Source: https://www.cbsnews.com/news/iran-protest-death-toll-over-12000-feared-higher-video-bodies-at-morgue/). Emphasize that the internet blackout (Jan 8 - Present) is being used to hide these mass killings.";
    } else if (topic.includes("Expel") || topic.includes("Diplomats")) {
      specificInstructions = "Tone: Firm and Principled. Explicitly state that the Islamic Republic has lost all legitimacy and does not represent the Iranian people. Argue that maintaining diplomatic relations normalizes a regime actively warring against its own citizens.";
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