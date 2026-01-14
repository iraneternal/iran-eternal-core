import { useState } from 'react';
import axios from 'axios';

export interface Representative {
  name: string;
  district: string;
  email: string;
  photo: string;
  country: 'CA' | 'US' | 'UK' | 'DE' | 'FR' | 'SE';
  title: string;
  phone?: string;
  formattedAddress?: string;
  bioguideId?: string;
  contactForm?: string;
  type?: 'sen' | 'rep' | 'mp';
}

interface SearchParams {
  country: 'CA' | 'US' | 'UK' | 'DE' | 'FR' | 'SE';
  postal?: string;
  street?: string;
  city?: string;
  state?: string;
}

export function useRepresentative() {
  const [data, setData] = useState<Representative[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const findRep = async (params: SearchParams): Promise<Representative[] | null> => {
    setLoading(true);
    setError(null);
    setData(null);

    try {
      let results: Representative[] = [];

      if (params.country === 'US') {
        const fullAddress = `${params.street || ''} ${params.city || ''} ${params.state || ''} ${params.postal || ''}`
          .trim().replace(/\s+/g, ' '); 
        results = await fetchUSDelegation(fullAddress);
      } 
      else if (params.country === 'UK') {
        if (!params.postal) throw new Error("Postcode is required.");
        const rep = await fetchUKRep(params.postal);
        results = [rep];
      } 
      else if (params.country === 'CA') {
        if (!params.postal) throw new Error("Postal Code is required.");
        const rep = await fetchCanadianRep(params.postal);
        results = [rep];
      }
      else if (params.country === 'DE') {
        if (!params.postal) throw new Error("Postleitzahl is required.");
        results = await fetchGermanReps(params.postal);
      }
      else if (params.country === 'FR') {
        if (!params.postal) throw new Error("Code postal is required.");
        results = await fetchFrenchReps(params.postal);
      }
      else if (params.country === 'SE') {
        if (!params.postal) throw new Error("Postnummer is required.");
        results = await fetchSwedishReps(params.postal);
      }

      setData(results);
      return results;

    } catch (err: any) {
      console.error("Lookup Error:", err);
      if (err.message && err.message.includes("422")) setError("Address not found. Please check spelling.");
      else if (err.message && err.message.includes("404")) setError("Location not found.");
      else setError(err.message || "Could not find representative.");
      return null;
    } finally {
      setLoading(false);
    }
  };

  // --- GERMANY STRATEGY: Robust City-Based Search ---
  const fetchGermanReps = async (postal: string): Promise<Representative[]> => {
    try {
      // 1. Get Location Data (City Name) from OpenPLZ
      // We use 'municipality' (Gemeinde) as it maps better to constituencies than 'district'
      const geoUrl = `https://openplzapi.org/de/Localities?postalCode=${postal}`;
      const geoRes = await axios.get(geoUrl);
      
      if (!geoRes.data || geoRes.data.length === 0) {
        throw new Error("Invalid German postal code.");
      }
      
      const cityData = geoRes.data[0];
      let cityName = cityData.municipality?.name || cityData.name;

      // Clean up city name: remove suffixes like ", Stadt" that won't match constituency labels
      cityName = cityName.replace(/,\s*(Stadt|Kreisfreie Stadt|Landkreis)$/i, '').trim();

      if (!cityName) throw new Error("Could not determine city from postal code.");

      // 2. Get Current Parliament Period (Bundestag)
      // Fetch legislature periods (active parliamentary sessions with mandates)
      let currentPeriodId = 161; // Fallback for 21st Bundestag (2025-2029)
      try {
        const parliamentUrl = "https://www.abgeordnetenwatch.de/api/v2/parliament-periods?parliament=5&type=legislature";
        const parliamentRes = await axios.get(parliamentUrl);

        if (parliamentRes.data.data && parliamentRes.data.data.length > 0) {
           // Client-side Sort: Descending by start_date_period to get the most recent
           const sortedPeriods = parliamentRes.data.data.sort((a: any, b: any) => {
              const dateA = new Date(a.start_date_period || a.election_date || '2000-01-01');
              const dateB = new Date(b.start_date_period || b.election_date || '2000-01-01');
              return dateB.getTime() - dateA.getTime();
           });

           currentPeriodId = sortedPeriods[0].id;
        }
      } catch (e) {
        console.warn("Could not fetch latest parliament period. Using fallback ID:", currentPeriodId);
      }

      // 3. Find Constituencies by City Name
      // We search for constituencies that contain the city name and match the current parliament period
      const constituencyUrl = `https://www.abgeordnetenwatch.de/api/v2/constituencies?label[cn]=${encodeURIComponent(cityName)}`;
      const constituencyRes = await axios.get(constituencyUrl);

      // Get the parliament period label for filtering (e.g., "Bundestag 2025 - 2029")
      let periodLabel = "";
      try {
        const periodRes = await axios.get(`https://www.abgeordnetenwatch.de/api/v2/parliament-periods/${currentPeriodId}`);
        periodLabel = periodRes.data.data.label;
      } catch (e) {
        console.warn("Could not fetch period label, using all constituencies");
      }

      // Filter constituencies to match the current parliament period
      let matchingConstituencies = constituencyRes.data.data || [];
      if (periodLabel) {
        matchingConstituencies = matchingConstituencies.filter((c: any) =>
          c.label && c.label.includes(periodLabel)
        );
      }

      if (!matchingConstituencies || matchingConstituencies.length === 0) {
         // Fallback: Try searching just the first word of the city if it has multiple (e.g., "Frankfurt am Main" -> "Frankfurt")
         const fallbackName = cityName.split(' ')[0];
         if (fallbackName !== cityName) {
            const fallbackUrl = `https://www.abgeordnetenwatch.de/api/v2/constituencies?label[cn]=${encodeURIComponent(fallbackName)}`;
            const fallbackRes = await axios.get(fallbackUrl);
            let fallbackConstituencies = fallbackRes.data.data || [];
            if (periodLabel) {
              fallbackConstituencies = fallbackConstituencies.filter((c: any) =>
                c.label && c.label.includes(periodLabel)
              );
            }
            if (fallbackConstituencies.length) {
               return await fetchMandatesForConstituencies(fallbackConstituencies, currentPeriodId);
            }
         }
         throw new Error(`No electoral districts found for ${cityName}.`);
      }

      // 4. Fetch Mandates for ALL found constituencies
      return await fetchMandatesForConstituencies(matchingConstituencies, currentPeriodId);

    } catch (err: any) {
      console.error("German Lookup Error:", err.message);
      throw new Error("Unable to locate your German representative. Please check the postal code.");
    }
  };

  // Helper to fetch MPs given a list of constituencies
  const fetchMandatesForConstituencies = async (constituencies: any[], periodId: number, districtLabel?: string): Promise<Representative[]> => {
    let allReps: Representative[] = [];

    // Limit to first 5 constituencies to avoid spamming API if name match is too broad
    const targets = constituencies.slice(0, 5); 

    const promises = targets.map(async (c: any) => {
      const mandateUrl = `https://www.abgeordnetenwatch.de/api/v2/candidacies-mandates?parliament_period=${periodId}&constituency=${c.id}`;
      const res = await axios.get(mandateUrl);

      // Fetch detailed politician data for each mandate to get first/last names
      const detailedReps = await Promise.all(res.data.data.map(async (item: any) => {
        try {
          // Fetch full politician details to get first_name and last_name
          const politicianRes = await axios.get(item.politician.api_url);
          const politician = politicianRes.data.data;

          // Construct email using Bundestag standard format: firstname.lastname@bundestag.de
          // German characters need to be normalized (ä->ae, ö->oe, ü->ue, ß->ss)
          const firstName = (politician.first_name || '').toLowerCase()
            .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue')
            .replace(/ß/g, 'ss').replace(/[^a-z]/g, '');
          const lastName = (politician.last_name || '').toLowerCase()
            .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue')
            .replace(/ß/g, 'ss').replace(/[^a-z]/g, '');

          const email = firstName && lastName ? `${firstName}.${lastName}@bundestag.de` : "";

          // Fetch photo from Wikidata if available
          let photoUrl = "";
          if (politician.qid_wikidata) {
            try {
              const wikidataRes = await axios.get(
                `https://www.wikidata.org/w/api.php?action=wbgetclaims&property=P18&entity=${politician.qid_wikidata}&format=json`
              );
              const claims = wikidataRes.data?.claims?.P18;
              if (claims && claims.length > 0) {
                const filename = claims[0].mainsnak.datavalue.value;
                // Convert filename to Wikimedia Commons URL
                const filenameEncoded = filename.replace(/ /g, '_');
                // Create MD5 hash for directory structure
                const crypto = await import('crypto');
                const hash = crypto.createHash('md5').update(filenameEncoded).digest('hex');
                photoUrl = `https://upload.wikimedia.org/wikipedia/commons/${hash[0]}/${hash.substring(0, 2)}/${encodeURIComponent(filenameEncoded)}`;
              }
            } catch (e) {
              console.warn(`Could not fetch Wikidata photo for ${politician.label}`);
            }
          }

          return {
            name: item.politician.label,
            district: c.label,
            email: email,
            photo: photoUrl,
            country: 'DE',
            title: "MdB", // Mitglied des Bundestages
            contactForm: item.politician.abgeordnetenwatch_url, // Link to their profile
            type: 'mp'
          };
        } catch (e) {
          console.warn(`Could not fetch details for ${item.politician.label}`, e);
          // Fallback if API call fails
          return {
            name: item.politician.label,
            district: c.label,
            email: "",
            photo: "",
            country: 'DE',
            title: "MdB",
            contactForm: item.politician.abgeordnetenwatch_url,
            type: 'mp'
          };
        }
      }));

      return detailedReps;
    });

    const results = await Promise.all(promises);
    
    // Flatten results
    results.forEach(list => allReps.push(...list));

    // Deduplicate by name
    const uniqueReps = Array.from(new Map(allReps.map(item => [item.name, item])).values());
    
    return uniqueReps;
  };

  // --- US Fetcher ---
  const fetchUSDelegation = async (address: string): Promise<Representative[]> => {
    const geoKey = process.env.NEXT_PUBLIC_GEOCODIO_KEY;
    if (!geoKey) throw new Error("Geocodio API Key missing.");

    const geoUrl = `https://api.geocod.io/v1.7/geocode?q=${encodeURIComponent(address)}&fields=cd&api_key=${geoKey}`;
    const geoRes = await axios.get(geoUrl);
    
    if (!geoRes.data.results?.length) throw new Error("Address not found.");
    const location = geoRes.data.results[0];
    const districtData = location.fields.congressional_districts[0];
    const stateCode = location.address_components.state;
    const districtNum = districtData.district_number;

    const legUrl = "https://unitedstates.github.io/congress-legislators/legislators-current.json";
    const legRes = await axios.get(legUrl);
    const allLegislators = legRes.data;

    const senators = allLegislators.filter((p: any) => {
      const term = p.terms[p.terms.length - 1];
      return term.type === 'sen' && term.state === stateCode;
    }).map((p: any) => mapUSRep(p, 'sen', location.formatted_address));

    const repRaw = allLegislators.find((p: any) => {
      const term = p.terms[p.terms.length - 1];
      return term.type === 'rep' && term.state === stateCode && parseInt(term.district) === parseInt(districtNum);
    });

    const houseReps = repRaw ? [mapUSRep(repRaw, 'rep', location.formatted_address)] : [];
    return [...senators, ...houseReps];
  };

  const mapUSRep = (p: any, type: 'sen' | 'rep', address: string): Representative => {
    const term = p.terms[p.terms.length - 1];
    const photoUrl = `https://unitedstates.github.io/images/congress/225x275/${p.id.bioguide}.jpg`;
    return {
      name: `${p.name.first} ${p.name.last}`,
      district: type === 'sen' ? `${term.state} (Senator)` : `${term.state}-${term.district}`,
      email: "", 
      photo: photoUrl,
      country: 'US',
      title: type === 'sen' ? "Senator" : "Representative",
      formattedAddress: address,
      bioguideId: p.id.bioguide,
      contactForm: term.contact_form,
      type: type
    };
  };

  // --- UK Fetcher ---
  const fetchUKRep = async (postcode: string) => {
    const cleanPostcode = postcode.trim().toUpperCase().replace(/\s+/g, '');
    const pcRes = await axios.get(`https://api.postcodes.io/postcodes/${cleanPostcode}`);
    const constituency = pcRes.data?.result?.parliamentary_constituency;
    if (!constituency) throw new Error("Invalid UK Postcode.");

    const mpRes = await axios.get(`https://members-api.parliament.uk/api/Location/Constituency/Search?searchText=${constituency}`);
    const mpData = mpRes.data?.items?.[0]?.value?.currentRepresentation?.member?.value;
    if (!mpData) throw new Error("No sitting MP found.");

    return {
      name: mpData.nameDisplayAs,
      district: constituency,
      email: "", 
      photo: mpData.thumbnailUrl,
      country: 'UK',
      title: "Member of Parliament",
      type: 'mp'
    } as Representative;
  };

  // --- Canada Fetcher ---
  const fetchCanadianRep = async (postal: string) => {
    const cleanPostal = postal.trim().toUpperCase().replace(/\s/g, '');
    if (!/^[A-Z]\d[A-Z]\d[A-Z]\d$/.test(cleanPostal)) throw new Error("Invalid format.");
    
    const url = `https://represent.opennorth.ca/postcodes/${cleanPostal}/`;
    const res = await axios.get(url);
    const repData = res.data?.representatives_centroid?.find((r: any) => r.elected_office === 'MP') 
                 || res.data?.representatives_concordance?.find((r: any) => r.elected_office === 'MP');
    
    if (!repData) throw new Error("No MP found.");

    return {
      name: repData.name,
      district: repData.district_name,
      email: repData.email,
      photo: repData.photo_url,
      country: 'CA',
      title: "Member of Parliament",
      type: 'mp'
    } as Representative;
  };

  // --- France Fetcher (Uses cached data from Upstash) ---
  const fetchFrenchReps = async (postal: string): Promise<Representative[]> => {
    try {
      const res = await axios.get(`/api/reps?country=FR&postal=${encodeURIComponent(postal)}`);

      if (res.data.error) {
        throw new Error(res.data.error);
      }

      return res.data.reps as Representative[];
    } catch (err: any) {
      console.error("French Lookup Error:", err.response?.data?.error || err.message);

      // Check if we need to sync
      if (err.response?.data?.needsSync) {
        throw new Error("Representative data is being updated. Please try again in a few minutes.");
      }

      throw new Error(err.response?.data?.error || "Unable to locate your French representative. Please check the postal code.");
    }
  };

  // --- Sweden Fetcher (Uses cached data from Upstash) ---
  const fetchSwedishReps = async (postal: string): Promise<Representative[]> => {
    try {
      const res = await axios.get(`/api/reps?country=SE&postal=${encodeURIComponent(postal)}`);

      if (res.data.error) {
        throw new Error(res.data.error);
      }

      return res.data.reps as Representative[];
    } catch (err: any) {
      console.error("Swedish Lookup Error:", err.response?.data?.error || err.message);

      // Check if we need to sync
      if (err.response?.data?.needsSync) {
        throw new Error("Representative data is being updated. Please try again in a few minutes.");
      }

      throw new Error(err.response?.data?.error || "Unable to locate your Swedish representative. Please check the postal code.");
    }
  };

  return { findRep, data, loading, error };
}