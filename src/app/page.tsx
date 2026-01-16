'use client';
import { useState, useMemo, useEffect } from 'react';
import axios from 'axios';
import {
  Copy, Loader2, ShieldCheck, Mail, User, MapPin,
  Share2, X, ExternalLink, CheckSquare, Square, CheckCircle2
} from 'lucide-react';
import { useRepresentative } from '@/hooks/useRepresentative';

const COUNTRIES = [
  { code: 'EU', name: 'EU Parliament', flag: 'https://flagcdn.com/eu.svg' },
  { code: 'CA', name: 'Canada', flag: 'https://flagcdn.com/ca.svg' },
  { code: 'UK', name: 'United Kingdom', flag: 'https://flagcdn.com/gb.svg' },
  { code: 'DE', name: 'Germany', flag: 'https://flagcdn.com/de.svg' },
  { code: 'FR', name: 'France', flag: 'https://flagcdn.com/fr.svg' },
  { code: 'SE', name: 'Sweden', flag: 'https://flagcdn.com/se.svg' },
  { code: 'AU', name: 'Australia', flag: 'https://flagcdn.com/au.svg' },
  { code: 'US', name: 'United States', flag: 'https://flagcdn.com/us.svg' },
] as const;

// EU Member States for dropdown when EU is selected
const EU_MEMBER_STATES = [
  { code: 'AT', name: 'Austria' },
  { code: 'BE', name: 'Belgium' },
  { code: 'BG', name: 'Bulgaria' },
  { code: 'HR', name: 'Croatia' },
  { code: 'CY', name: 'Cyprus' },
  { code: 'CZ', name: 'Czech Republic' },
  { code: 'DK', name: 'Denmark' },
  { code: 'EE', name: 'Estonia' },
  { code: 'FI', name: 'Finland' },
  { code: 'FR', name: 'France' },
  { code: 'DE', name: 'Germany' },
  { code: 'GR', name: 'Greece' },
  { code: 'HU', name: 'Hungary' },
  { code: 'IE', name: 'Ireland' },
  { code: 'IT', name: 'Italy' },
  { code: 'LV', name: 'Latvia' },
  { code: 'LT', name: 'Lithuania' },
  { code: 'LU', name: 'Luxembourg' },
  { code: 'MT', name: 'Malta' },
  { code: 'NL', name: 'Netherlands' },
  { code: 'PL', name: 'Poland' },
  { code: 'PT', name: 'Portugal' },
  { code: 'RO', name: 'Romania' },
  { code: 'SK', name: 'Slovakia' },
  { code: 'SI', name: 'Slovenia' },
  { code: 'ES', name: 'Spain' },
  { code: 'SE', name: 'Sweden' },
] as const;

const STEPS = [
  { id: 1, title: "Find Your Representatives", desc: "Locate your elected officials" },
  { id: 2, title: "Personalize", desc: "Add your details" },
  { id: 3, title: "Review & Copy", desc: "Send your message" }
];

export default function Home() {
  const [step, setStep] = useState(1);
  const [showPrivacy, setShowPrivacy] = useState(false);

  // Search State
  const [selectedCountry, setSelectedCountry] = useState<'CA' | 'US' | 'UK' | 'DE' | 'FR' | 'SE' | 'AU' | 'EU'>('EU');
  const [postal, setPostal] = useState('');
  const [usStreet, setUsStreet] = useState('');
  const [usCity, setUsCity] = useState('');
  const [usZip, setUsZip] = useState('');
  const [euMemberState, setEuMemberState] = useState('');

  // User Details
  const [userName, setUserName] = useState('');
  const [userAddress, setUserAddress] = useState(''); 

  // Rep Data & Selection
  const { findRep, data: reps, loading: repLoading, error: repError } = useRepresentative();
  const [selectedRepIndices, setSelectedRepIndices] = useState<number[]>([]);

  // AI Generation
  const [emailContent, setEmailContent] = useState<any>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [topic, setTopic] = useState('Stop the Massacre: Condemn Killing of 500+ Protesters');
  
  // Mobile UI Feedback
  const [showCopiedToast, setShowCopiedToast] = useState(false);

  // Auto-select all reps when found
  useEffect(() => {
    if (reps) {
      setSelectedRepIndices(reps.map((_, i) => i));
    }
  }, [reps]);

  const primaryRep = useMemo(() => reps?.[0], [reps]);
  
  const selectedReps = useMemo(() => {
    return reps?.filter((_, i) => selectedRepIndices.includes(i)) || [];
  }, [reps, selectedRepIndices]);

  const availableTopics = useMemo(() => {
    const baseTopics = [
      "Stop the Massacre: Condemn Killing of 12,000+ Protesters",
      "Invoke R2P: International Responsibility to Protect the Iranian People",
      "Emergency Action: End Total Internet Blackout (Since Jan 8)",
      "Crimes Against Humanity: Support UN Investigation & ICC Referral"
    ];

    // Add "Expel Diplomats" option for European countries and EU Parliament
    if (['UK', 'DE', 'FR', 'SE', 'EU'].includes(primaryRep?.country || '')) {
      baseTopics.splice(1, 0, "Expel Iran Regime Diplomats");
    }

    // Add EU-specific topic for Reza Pahlavi invitation
    if (primaryRep?.country === 'EU') {
      baseTopics.unshift("Urgent: Sign letter to invite Reza Pahlavi to EU Parliament plenary");
    }

    return baseTopics;
  }, [primaryRep?.country]);

  // Reset topic to first available when country changes (prevents stale topic on EU selection)
  useEffect(() => {
    if (availableTopics.length > 0) {
      setTopic(availableTopics[0]);
    }
  }, [availableTopics]);

  // Toggle Selection
  const toggleRep = (index: number) => {
    setSelectedRepIndices(prev => 
      prev.includes(index) ? prev.filter(i => i !== index) : [...prev, index]
    );
  };

  const handleFind = async () => {
    const results = await findRep({
      country: selectedCountry,
      postal, street: usStreet, city: usCity,
      ...(selectedCountry === 'US' && { postal: usZip }),
      ...(selectedCountry === 'EU' && { memberState: euMemberState })
    });

    if (results && results.length > 0) {
      if (selectedCountry !== 'US') {
        setUserAddress('');
      }
      setStep(2);
    }
  };

  const handleGenerate = async () => {
    if (selectedReps.length === 0) {
      alert("Please select at least one representative.");
      return;
    }

    setAiLoading(true);
    try {
      const names = selectedReps.map(r => `${r.title} ${r.name}`).join(', ');
      
      const signatureAddress = selectedCountry === 'US'
        ? (usStreet && usCity && usZip ? `${usStreet}, ${usCity} ${usZip}` : '')
        : userAddress;

      const res = await axios.post('/api/generate', {
        repName: names,
        userCity: primaryRep?.district || 'my region',
        country: selectedCountry,
        topic: topic,
        tone: 'Urgent and Dignified',
        userName: userName || '[YOUR NAME]',
        userAddress: signatureAddress || '[YOUR ADDRESS]',
        userPhone: ""
      });
      setEmailContent(res.data);
      setStep(3);
    } catch (e: any) {
      const msg = e.response?.data?.error || "Error generating content.";
      alert(msg);
    } finally {
      setAiLoading(false);
    }
  };

  const handleManualContact = (rep: any) => {
    navigator.clipboard.writeText(`${emailContent.subject}\n\n${emailContent.body}`)
      .then(() => {
        setShowCopiedToast(true);
        setTimeout(() => setShowCopiedToast(false), 3000);
      })
      .catch(err => console.error('Copy failed', err));

    if (rep.contactForm) {
       window.open(rep.contactForm, '_blank');
    } else {
       alert("No contact form URL found.");
    }
  };

  const shareUrl = "https://iraneternal.com";
  const shareText = "The Islamic regime in Iran has cut the internet to hide a massacre. Break the silence. Use this tool to contact your representative now:";

  const handleGenericShare = async () => {
    if (navigator.share) {
      await navigator.share({ title: 'Iran Eternal', text: shareText, url: shareUrl }).catch(() => {});
    } else {
      navigator.clipboard.writeText(shareUrl);
      alert('Link copied to clipboard!');
    }
  };

  // Helper to generate mailto string for multiple recipients
  const getMailtoLink = () => {
    if (!emailContent) return "#";
    // Combine emails from all selected reps
    const emails = selectedReps.map(r => r.email).filter(e => e).join(',');
    // Replace \n with \r\n (CRLF) for better compatibility with iOS Gmail and other mobile email clients
    const bodyWithCRLF = emailContent.body.replace(/\n/g, '\r\n');
    return `mailto:${emails}?subject=${encodeURIComponent(emailContent.subject)}&body=${encodeURIComponent(bodyWithCRLF)}`;
  };

  return (
    <main className="min-h-screen flex flex-col items-center justify-start pt-8 pb-12 px-4 font-sans text-white relative">
      
      {/* TOAST NOTIFICATION */}
      {showCopiedToast && (
        <div className="fixed top-5 z-50 animate-in fade-in slide-in-from-top-4 duration-300">
          <div className="bg-black text-white px-6 py-3 rounded-full shadow-2xl border border-gray-700 flex items-center gap-2 font-bold text-sm">
            <CheckCircle2 className="text-green-500" size={18} />
            Message Copied! Opening form...
          </div>
        </div>
      )}

      {/* 1. HERO */}
      <div className="max-w-3xl w-full text-center mb-8 space-y-5 animate-in fade-in slide-in-from-top-4 duration-700">
        <div className="flex flex-col md:flex-row items-center justify-center gap-4">
          <img src="https://flagofiran.com/files/Flag_of_Iran_simplified.svg" alt="Flag of Iran" className="h-14 w-auto rounded-lg shadow-lg border border-white/10" />
          <div className="text-center md:text-left">
            <h1 className="font-serif text-4xl md:text-5xl font-bold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-white via-gray-100 to-gray-400">IRAN ETERNAL</h1>
            <p className="text-[#C5A059] text-xs md:text-sm uppercase tracking-[0.3em] font-semibold mt-1">The Voice of Freedom</p>
          </div>
        </div>
        
        {/* SUBTLE TRUST LINE */}
        <button
           onClick={() => setShowPrivacy(true)}
           className="inline-flex items-center justify-center gap-1.5 mt-3 text-gray-400 hover:text-gray-200 transition-colors cursor-pointer group mx-auto"
        >
           <ShieldCheck size={14} className="text-green-400/70 group-hover:text-green-400"/>
           <span className="text-[11px] tracking-wide">Open Source • No Data Stored • <span className="underline underline-offset-2">Learn More</span></span>
        </button>

        <div className="bg-white/5 backdrop-blur-sm rounded-xl p-4 border border-white/10 text-gray-200 text-sm leading-relaxed max-w-xl mx-auto shadow-xl mt-4">
          <p>
            <strong>Why this matters:</strong> The Islamic regime in Iran have cut the internet since Jan 8 to hide a massacre. Men, women, and children are being killed in the dark right now. Don't let the world look away.
            <span className="block mt-2 text-white font-medium border-t border-white/10 pt-2 text-center text-lg font-serif">Your voice is their lifeline.</span>
          </p>
        </div>
      </div>

      {/* MAIN CARD */}
      <div className="max-w-xl w-full bg-white rounded-3xl shadow-2xl overflow-hidden border border-gray-200/50 relative">
        
        {/* HEADER */}
        <div className="bg-gray-50/50 border-b border-gray-100 p-8 pb-6 text-center">
          <div className="flex justify-center gap-2 mb-6">
            {STEPS.map((s) => (
              <div key={s.id} className={`h-1.5 w-10 rounded-full transition-all duration-500 ease-in-out ${s.id === step ? 'bg-[#C5A059] w-12' : step > s.id ? 'bg-[#C5A059]/40' : 'bg-gray-200'}`} />
            ))}
          </div>
          <h2 className="text-2xl font-bold text-gray-900 tracking-tight">{STEPS[step - 1].title}</h2>
          <p className="text-gray-500 text-sm font-medium">{STEPS[step - 1].desc}</p>
        </div>

        <div className="p-6 md:p-8 bg-white text-gray-900 min-h-[300px]">
          
          {/* STEP 1: FIND REP */}
          {step === 1 && (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-500">
              <div role="radiogroup" aria-label="Select your country" className="grid grid-cols-2 gap-3">
                {COUNTRIES.map((c) => (
                  <button
                    key={c.code}
                    role="radio"
                    aria-checked={selectedCountry === c.code}
                    onClick={() => setSelectedCountry(c.code)}
                    className={`flex flex-col items-center justify-center p-4 rounded-xl border-2 transition-all duration-150 touch-manipulation ${
                      selectedCountry === c.code
                        ? 'bg-white border-black text-black shadow-md'
                        : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50 hover:border-gray-300'
                    }`}
                  >
                    <img
                      src={c.flag}
                      alt=""
                      className="w-12 h-9 rounded shadow-sm object-cover"
                      loading="lazy"
                    />
                    <span className="text-xs font-bold mt-2 text-center">{c.name}</span>
                  </button>
                ))}
              </div>

              <div className="space-y-4">
                {selectedCountry === 'US' ? (
                  <div className="space-y-3">
                    <input className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl focus:border-black focus:ring-2 focus:ring-black/5 outline-none text-base transition-all placeholder:text-gray-400" placeholder="Street Address" value={usStreet} onChange={(e) => setUsStreet(e.target.value)} />
                    <div className="flex flex-col md:flex-row gap-3">
                      <input className="w-full md:flex-[2] p-4 bg-gray-50 border border-gray-200 rounded-xl focus:border-black focus:ring-2 focus:ring-black/5 outline-none text-base transition-all placeholder:text-gray-400" placeholder="City" value={usCity} onChange={(e) => setUsCity(e.target.value)} />
                      <input className="w-full md:flex-1 p-4 bg-gray-50 border border-gray-200 rounded-xl focus:border-black focus:ring-2 focus:ring-black/5 outline-none text-base transition-all placeholder:text-gray-400" placeholder="Zip Code" value={usZip} onChange={(e) => setUsZip(e.target.value)} inputMode="numeric" />
                    </div>
                  </div>
                ) : selectedCountry === 'EU' ? (
                  <div className="space-y-3">
                    <p className="text-sm text-gray-600 text-center">Select your EU member state to find your MEPs</p>
                    <select
                      value={euMemberState}
                      onChange={(e) => setEuMemberState(e.target.value)}
                      className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl focus:border-black focus:ring-2 focus:ring-black/5 outline-none text-base transition-all"
                    >
                      <option value="">Select your country...</option>
                      {EU_MEMBER_STATES.map((state) => (
                        <option key={state.code} value={state.code}>{state.name}</option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <input value={postal} onChange={(e) => setPostal(e.target.value)} placeholder={
                    selectedCountry === 'CA' ? "Postal Code (e.g. M5V 2H1)" :
                    selectedCountry === 'DE' ? "Postleitzahl (PLZ)" :
                    selectedCountry === 'FR' ? "Code Postal (ex: 75001)" :
                    selectedCountry === 'SE' ? "Postnummer (ex: 11453)" :
                    selectedCountry === 'AU' ? "Postcode (e.g. 2000)" :
                    "Postcode (e.g. SW1A 0AA)"
                  } className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl focus:border-black focus:ring-2 focus:ring-black/5 outline-none font-medium uppercase text-base transition-all placeholder:text-gray-400" onKeyDown={(e) => e.key === 'Enter' && handleFind()} />
                )}
                <button onClick={handleFind} disabled={repLoading} className="w-full bg-black text-white py-4 rounded-xl font-bold hover:bg-gray-800 transition-all disabled:opacity-50 flex justify-center items-center gap-2 text-lg active:scale-[0.98] shadow-lg shadow-black/20">
                  {repLoading ? <Loader2 className="animate-spin" /> : <>Continue</>}
                </button>
              </div>
              {repError && <div className="bg-red-50 text-red-600 p-4 rounded-xl text-sm text-center border border-red-100 font-medium animate-in zoom-in-95">{repError}</div>}
            </div>
          )}

          {/* STEP 2: SELECT REPS & DETAILS */}
          {step === 2 && reps && reps.length > 0 && (
             <div className="space-y-6 animate-in fade-in slide-in-from-right-8 duration-500">
               
               {/* Selection List - USA, GERMANY, FRANCE, SWEDEN, AUSTRALIA, EU (Multiple Reps possible per region/zip) */}
               {['US', 'DE', 'FR', 'SE', 'AU', 'EU'].includes(selectedCountry) ? (
                 <div className="space-y-2">
                   <p className="text-xs font-bold text-gray-400 uppercase tracking-wider ml-1">Select Recipients:</p>
                   <div className="grid gap-2 max-h-[220px] overflow-y-auto pr-1 custom-scrollbar">
                      {reps.map((r, i) => {
                         const isSelected = selectedRepIndices.includes(i);
                         return (
                           <div key={i} onClick={() => toggleRep(i)} className={`flex items-center gap-4 p-3 rounded-2xl border cursor-pointer transition-all ${isSelected ? 'bg-blue-50 border-blue-200 shadow-sm' : 'bg-white border-gray-100 hover:border-gray-200'}`}>
                              <div className={`shrink-0 ${isSelected ? 'text-blue-600' : 'text-gray-300'}`}>
                                 {isSelected ? <CheckSquare size={22} /> : <Square size={22} />}
                              </div>
                              <img 
                                src={r.photo || "/placeholder.png"} 
                                alt={r.name}
                                referrerPolicy="no-referrer"
                                className="w-10 h-10 rounded-full object-cover bg-gray-100 border border-gray-100" 
                                onError={(e) => { e.currentTarget.src = "https://upload.wikimedia.org/wikipedia/commons/thumb/a/ad/Placeholder_no_text.svg/1024px-Placeholder_no_text.svg.png"; }} 
                              />
                              <div>
                                 <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{r.title}</p>
                                 <h3 className="font-bold text-sm text-gray-900 leading-tight">{r.name}</h3>
                                 {r.committee && <p className="text-xs text-blue-600 font-medium">{r.committee}</p>}
                              </div>
                           </div>
                         );
                      })}
                   </div>
                 </div>
               ) : (
                 // Single Rep Countries (CA, UK)
                 <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-2xl border border-gray-100">
                    <img 
                      src={reps[0].photo} 
                      alt={reps[0].name}
                      referrerPolicy="no-referrer"
                      className="w-12 h-12 rounded-full object-cover bg-gray-200" 
                      onError={(e) => { e.currentTarget.src = "https://upload.wikimedia.org/wikipedia/commons/thumb/a/ad/Placeholder_no_text.svg/1024px-Placeholder_no_text.svg.png"; }} 
                    />
                    <div>
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Contacting</p>
                        <h3 className="font-bold text-gray-900">{reps[0].name}</h3>
                        <p className="text-xs text-gray-500">{reps[0].district}</p>
                    </div>
                 </div>
               )}

               {/* Inputs */}
               <div className="space-y-3">
                 {/* Name field */}
                 <div className="relative group">
                    <User size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input className="w-full p-4 pl-12 bg-white border border-gray-200 rounded-xl focus:border-black outline-none" placeholder="Your Full Name (optional)" value={userName} onChange={(e) => setUserName(e.target.value)} />
                 </div>

                 {/* Address only shown if NOT US (US uses search input) */}
                 {selectedCountry !== 'US' && (
                    <div className="relative group animate-in fade-in">
                       <MapPin size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                       <input className="w-full p-4 pl-12 bg-white border border-gray-200 rounded-xl focus:border-black outline-none" placeholder="Your Full Address (optional)" value={userAddress} onChange={(e) => setUserAddress(e.target.value)} />
                    </div>
                 )}

                 {/* Info hint */}
                 <div className="flex items-start gap-2 bg-gray-50 rounded-lg p-2.5 border border-gray-100">
                    <ShieldCheck size={16} className="text-green-500 shrink-0 mt-0.5"/>
                    <p className="text-xs text-gray-500 leading-relaxed">
                       <strong className="text-gray-600">Optional</strong> — officials take messages with real names more seriously. You can add them yourself after drafting. <strong className="text-green-600">Never saved.</strong>
                    </p>
                 </div>
               </div>

               <select className="w-full p-4 bg-white border border-gray-200 rounded-xl focus:border-[#C5A059] outline-none" value={topic} onChange={(e) => setTopic(e.target.value)}>
                 {availableTopics.map((t) => <option key={t} value={t}>{t}</option>)}
               </select>

               <div className="flex flex-col gap-3 pt-2">
                 <button onClick={handleGenerate} disabled={aiLoading} className="w-full bg-[#C5A059] text-white py-4 rounded-xl font-bold shadow-lg shadow-[#C5A059]/20 hover:brightness-110 transition-all flex justify-center items-center gap-2">
                   {aiLoading ? <Loader2 className="animate-spin" /> : "Draft My Letter"}
                 </button>
                 <button onClick={() => setStep(1)} className="text-gray-600 text-sm hover:text-black font-medium transition-colors">Back to search</button>
               </div>
             </div>
          )}

          {/* STEP 3: REVIEW & SEND */}
          {step === 3 && emailContent && reps && (
             <div className="space-y-6 animate-in fade-in slide-in-from-right-8 duration-500">
              <div className="bg-gray-50 p-1 rounded-2xl border border-gray-200 shadow-inner">
                <input value={emailContent.subject} readOnly className="w-full p-4 font-bold text-gray-900 border-b border-gray-200 outline-none bg-transparent" />
                <textarea value={emailContent.body} readOnly className="w-full p-4 text-gray-700 h-64 resize-none outline-none text-base leading-relaxed bg-transparent" />
              </div>
              
              {/* BUTTONS: SPLIT LOGIC FOR US vs NON-US */}
              
              {/* OPTION A: CANADA / UK / GERMANY / EU (Standard Send Button + Copy) */}
              {selectedCountry !== 'US' && (
                <div className="space-y-3 pt-2">
                  <div className="flex flex-col gap-3 sm:flex-row">
                    <button onClick={() => { navigator.clipboard.writeText(`${emailContent.subject}\n\n${emailContent.body}`); alert("Copied!"); }} className="flex-1 py-3 border-2 border-gray-100 rounded-xl font-bold text-gray-600 hover:bg-gray-50 flex justify-center items-center gap-2 touch-manipulation">
                      <Copy size={18}/> Copy
                    </button>
                    <a href={getMailtoLink()} className="flex-1 py-3 bg-black text-white rounded-xl font-bold hover:bg-gray-800 transition-all flex justify-center items-center gap-2 touch-manipulation shadow-lg shadow-black/20">
                      <Mail size={18}/> Send from My Email
                    </a>
                  </div>
                  {/* Trust Reassurance */}
                  <div className="flex items-center justify-center gap-2 text-[10px] text-gray-400">
                    <ShieldCheck size={12} className="text-green-500"/>
                    <span>This opens your email app (Gmail, Outlook, etc.) — we never see or send your email</span>
                  </div>
                </div>
              )}

              {/* OPTION B: USA (Manual Contact Buttons) */}
              {selectedCountry === 'US' && (
                <div className="space-y-4 pt-2">
                   {/* Instruction Box */}
                   <div className="bg-blue-50 text-blue-800 p-3 rounded-xl text-xs flex items-start gap-2 border border-blue-100">
                      <Copy size={14} className="mt-0.5 shrink-0"/>
                      <span className="leading-snug">
                        <strong>How to send:</strong> Clicking <strong>Contact</strong> will automatically copy your message. The official form will open—simply paste and submit.
                      </span>
                   </div>

                   {/* List of Selected Reps to Contact */}
                   <div className="space-y-2">
                    {selectedReps.map((r, i) => (
                      <div key={i} className="flex justify-between items-center bg-white p-3 rounded-xl border border-gray-200 shadow-sm">
                        <div className="flex gap-3 items-center">
                          <img 
                            src={r.photo} 
                            alt={r.name}
                            referrerPolicy="no-referrer"
                            className="w-10 h-10 rounded-full bg-gray-100 object-cover border border-gray-100" 
                            onError={(e) => { e.currentTarget.src = "https://upload.wikimedia.org/wikipedia/commons/thumb/a/ad/Placeholder_no_text.svg/1024px-Placeholder_no_text.svg.png"; }}
                          />
                          <div>
                            <p className="text-xs font-bold uppercase text-gray-400">{r.title}</p>
                            <p className="text-sm font-bold text-gray-900">{r.name}</p>
                          </div>
                        </div>
                        
                        <button 
                          onClick={() => handleManualContact(r)}
                          className="px-4 py-2 rounded-lg text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 flex items-center gap-1 transition-all shadow-md shadow-blue-600/20 active:scale-95"
                        >
                          Contact <ExternalLink size={12}/>
                        </button>
                      </div>
                    ))}
                   </div>
                </div>
              )}
              
              <button onClick={() => setStep(2)} className="w-full text-center text-gray-400 text-sm hover:text-black mt-2 font-medium">Make edits</button>
            </div>
          )}
        </div>
        
        {/* FOOTER */}
        <div className="bg-gray-50 p-4 border-t border-gray-100 flex flex-col gap-4 mt-auto">
          {/* Social Buttons */}
          <div className="flex justify-center flex-wrap gap-3">

            {/* 1. WHATSAPP */}
             <a 
               href={`https://wa.me/?text=${encodeURIComponent(shareText + " " + shareUrl)}`}
               target="_blank"
               rel="noopener noreferrer"
               className="flex items-center gap-2 px-5 py-2.5 bg-white border border-gray-200 rounded-full text-sm font-bold text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-all active:scale-95 shadow-sm">
               <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current" aria-hidden="true"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/></svg>
               WhatsApp
             </a>

             {/* 2. TELEGRAM */}
             <a 
               href={`https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(shareText)}`}
               target="_blank"
               rel="noopener noreferrer"
               className="flex items-center gap-2 px-5 py-2.5 bg-white border border-gray-200 rounded-full text-sm font-bold text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-all active:scale-95 shadow-sm">
               <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current" aria-hidden="true"><path d="M12 0C5.37 0 0 5.37 0 12s5.37 12 12 12 12-5.37 12-12S18.63 0 12 0zm5.56 8.4l-1.89 8.87c-.14.63-.51.78-1.04.49l-2.88-2.13-1.39 1.34c-.15.15-.28.28-.58.28l.21-2.93 5.33-4.82c.23-.21-.05-.32-.36-.12l-6.59 4.15-2.84-.89c-.62-.19-.63-.62.13-.92l11.09-4.28c.51-.19.96.11.81.96z"/></svg>
               Telegram
             </a>

             {/* 3. X (Twitter) */}
             <a 
               href={`https://x.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}`}
               target="_blank"
               rel="noopener noreferrer"
               className="flex items-center gap-2 px-5 py-2.5 bg-white border border-gray-200 rounded-full text-sm font-bold text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-all active:scale-95 shadow-sm">
               <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 fill-current"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"></path></svg>
               Post
             </a>
            <button onClick={handleGenericShare} className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-200 rounded-full text-gray-700 hover:bg-gray-50 shadow-sm"><Share2 size={16} /></button>
          </div>

          <div className="flex flex-wrap justify-center items-center gap-x-2 gap-y-1 text-[10px] md:text-xs text-gray-400">
             <div className="flex items-center gap-1.5"><ShieldCheck size={14} /><span>Secure • No Data Stored • </span></div>
             <button onClick={() => setShowPrivacy(true)} className="underline hover:text-gray-600 cursor-pointer font-medium">Private by Design</button>
             {/* FOOTER GITHUB LINK */}
             <a href="https://github.com/iraneternal/iran-eternal-core" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 hover:text-gray-600 transition-colors border-l border-gray-300 pl-2 ml-2">
                <svg height="14" width="14" viewBox="0 0 16 16" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"></path></svg>
                <span>View Source Code</span>
             </a>
          </div>
        </div>
      </div>
      
      {/* Privacy Modal */}
      {showPrivacy && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white text-gray-900 rounded-2xl max-w-lg w-full p-6 shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center mb-4 border-b pb-2">
              <h3 className="text-xl font-bold flex items-center gap-2"><ShieldCheck size={22} className="text-green-500"/> Privacy & Transparency</h3>
              <button onClick={() => setShowPrivacy(false)}><X size={20} /></button>
            </div>
            <div className="space-y-4 text-sm leading-relaxed overflow-y-auto max-h-[70vh]">

              {/* Data Flow Visualization */}
              <div className="bg-gradient-to-r from-green-50 to-blue-50 p-4 rounded-xl border border-green-200">
                 <p className="font-bold text-gray-700 mb-2 text-center text-xs uppercase tracking-wider">How Your Data Flows</p>
                 <div className="flex items-center justify-center gap-2 text-gray-800 text-xs flex-wrap">
                    <span className="bg-white px-2 py-1 rounded border">You Type</span>
                    <span>→</span>
                    <span className="bg-white px-2 py-1 rounded border">AI Drafts Letter</span>
                    <span>→</span>
                    <span className="bg-white px-2 py-1 rounded border">Opens YOUR Email App</span>
                    <span>→</span>
                    <span className="bg-green-100 px-2 py-1 rounded border border-green-300 font-bold">Data Gone 🗑️</span>
                 </div>
              </div>

              {/* Key Points */}
              <div className="space-y-3">
                <div className="flex gap-3 items-start">
                   <div className="bg-green-100 p-1.5 rounded-full shrink-0"><Mail size={14} className="text-green-600"/></div>
                   <div>
                      <p className="font-bold text-gray-900">Your email, your inbox</p>
                      <p className="text-gray-600 text-xs">We use standard <code className="bg-gray-100 px-1 rounded">mailto:</code> links. The email is sent directly from YOUR email client (Gmail, Outlook, Apple Mail, etc.) — we never see or touch it.</p>
                   </div>
                </div>

                <div className="flex gap-3 items-start">
                   <div className="bg-blue-100 p-1.5 rounded-full shrink-0"><ShieldCheck size={14} className="text-blue-600"/></div>
                   <div>
                      <p className="font-bold text-gray-900">No database. Period.</p>
                      <p className="text-gray-600 text-xs">We physically cannot store your data because we have no database. Your name and address exist only in your browser's memory while drafting, then vanish.</p>
                   </div>
                </div>

                <div className="flex gap-3 items-start">
                   <div className="bg-amber-100 p-1.5 rounded-full shrink-0"><User size={14} className="text-amber-600"/></div>
                   <div>
                      <p className="font-bold text-gray-900">Why name & address? (Optional)</p>
                      <p className="text-gray-600 text-xs">Elected officials often ignore anonymous messages. Including your name and address proves you're a real constituent — but it's your choice. You can leave them blank or add them yourself after drafting.</p>
                   </div>
                </div>

                <div className="flex gap-3 items-start">
                   <div className="bg-purple-100 p-1.5 rounded-full shrink-0"><svg height="14" width="14" viewBox="0 0 16 16" className="text-purple-600 fill-current"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg></div>
                   <div>
                      <p className="font-bold text-gray-900">100% Open Source</p>
                      <p className="text-gray-600 text-xs">Don't trust us — verify it yourself. Our entire codebase is public on <a href="https://github.com/iraneternal/iran-eternal-core" target="_blank" rel="noopener noreferrer" className="underline text-blue-600 font-semibold hover:text-blue-800">GitHub</a>. Anyone can audit and confirm there's no data collection.</p>
                   </div>
                </div>
              </div>

              {/* Bottom Summary */}
              <div className="bg-gray-100 p-3 rounded-lg text-center text-xs border border-gray-200">
                 <p className="font-semibold text-gray-700">🔒 Think of us as a typewriter, not a mailman.</p>
                 <p className="text-gray-500 mt-1">We help you write the letter. You send it yourself.</p>
              </div>

            </div>
            <button onClick={() => setShowPrivacy(false)} className="w-full mt-6 bg-black text-white py-3 rounded-xl font-bold hover:bg-gray-800 transition-colors">Got it</button>
          </div>
        </div>
      )}
    </main>
  );
}