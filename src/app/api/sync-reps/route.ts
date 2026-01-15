export const runtime = 'nodejs';
export const maxDuration = 60; // Allow up to 60 seconds for sync

import { NextResponse } from 'next/server';
import axios from 'axios';
import { redis, CACHE_KEYS, CACHE_TTL } from '@/lib/redis';

interface CachedRep {
  name: string;
  district: string;
  email: string;
  photo: string;
  deptCode?: string; // For France: department code
  valkrets?: string; // For Sweden: electoral district
  postcode?: string; // For Australia: postcode (House MPs)
  state?: string;    // For Australia: state (Senators)
  type?: string;     // mp, sen, or mep
  // EU MEP specific fields
  memberState?: string;     // For EU: country code (DE, FR, etc.)
  politicalGroup?: string;  // EU Parliament political group
  nationalParty?: string;   // National political party
  mepId?: string;           // EU Parliament MEP ID
}

// Sync France deputies from NosDéputés.fr 
async function syncFranceDeputies(): Promise<CachedRep[]> {

  // Try enmandat first
  let deputies: any[] = [];
  try {
    const enMandatRes = await axios.get('https://www.nosdeputes.fr/deputes/enmandat/json', { timeout: 30000 });
    deputies = enMandatRes.data?.deputes || [];
  } catch (e) {
    console.warn('enmandat endpoint failed');
  }

  // Fallback to all deputies if enmandat is empty
  if (deputies.length === 0) {
    const allRes = await axios.get('https://www.nosdeputes.fr/deputes/json', { timeout: 30000 });
    deputies = allRes.data?.deputes || [];
  }

  if (deputies.length === 0) {
    throw new Error('Could not fetch French deputy data');
  }

  const cachedReps: CachedRep[] = deputies.map((d: any) => {
    const dep = d.depute;

    // Get email from email field or emails array
    let email = dep.email || '';
    if (!email && dep.emails && dep.emails.length > 0) {
      const anEmail = dep.emails.find((e: any) =>
        e.email && e.email.includes('assemblee-nationale.fr')
      );
      email = anEmail?.email || dep.emails[0]?.email || '';
    }

    // Get department code
    let deptCode = dep.num_deptmt || '';

    return {
      name: dep.nom,
      district: `${dep.nom_circo} (${dep.num_circo})`,
      email: email,
      photo: dep.id_an ? `https://www.assemblee-nationale.fr/dyn/deputes/${dep.id_an}/image` : '',
      deptCode: deptCode,
    };
  });

  return cachedReps;
}

// Sync Sweden MPs from Riksdagen
async function syncSwedenMPs(): Promise<CachedRep[]> {

  const res = await axios.get('https://data.riksdagen.se/personlista/?utformat=json&rdlstatus=tjg', { timeout: 30000 });
  const allPersons = res.data?.personlista?.person || [];

  if (allPersons.length === 0) {
    throw new Error('Could not fetch Swedish MP data');
  }

  // Filter only current serving MPs
  const currentMPs = allPersons.filter((p: any) => p.status === 'Tjänstgörande riksdagsledamot');

  const cachedReps: CachedRep[] = currentMPs.map((p: any) => {
    // Extract email
    let email = '';
    const uppgifter = p.personuppgift?.uppgift;
    if (Array.isArray(uppgifter)) {
      const emailObj = uppgifter.find((u: any) => u.kod === 'Officiell e-postadress');
      const emailValue = emailObj?.uppgift;
      if (Array.isArray(emailValue)) {
        email = emailValue[0] || '';
      } else {
        email = emailValue || '';
      }
    } else if (uppgifter?.kod === 'Officiell e-postadress') {
      const emailValue = uppgifter.uppgift;
      email = Array.isArray(emailValue) ? emailValue[0] : emailValue || '';
    }
    email = email.replace('[på]', '@');

    return {
      name: `${p.tilltalsnamn} ${p.efternamn}`,
      district: p.valkrets,
      email: email,
      photo: p.bild_url_192 || '',
      valkrets: p.valkrets,
    };
  });

  return cachedReps;
}

// Australian states for Senator lookup
const AUSTRALIA_STATES = ['NSW', 'Victoria', 'Queensland', 'SA', 'WA', 'Tasmania', 'NT', 'ACT'];

// Sync Australia House MPs from OpenAustralia
async function syncAustraliaHouse(): Promise<CachedRep[]> {
  const apiKey = process.env.NEXT_PUBLIC_OPENAUSTRALIA_KEY?.trim();
  if (!apiKey) {
    throw new Error('OpenAustralia API key is missing');
  }

  // Fetch all current House representatives
  const res = await axios.get(`https://www.openaustralia.org.au/api/getRepresentatives?key=${apiKey}&output=js`, { timeout: 30000 });
  const allReps = res.data || [];

  if (allReps.length === 0) {
    throw new Error('Could not fetch Australian House representatives');
  }

  const cachedReps: CachedRep[] = allReps.map((rep: any) => {
    const firstName = (rep.first_name || '').toLowerCase().replace(/[^a-z]/g, '');
    const lastName = (rep.last_name || '').toLowerCase().replace(/[^a-z]/g, '');
    const email = firstName && lastName ? `${firstName}.${lastName}@aph.gov.au` : '';

    let photoUrl = rep.image || '';
    if (photoUrl && photoUrl.startsWith('/')) {
      photoUrl = `https://www.openaustralia.org.au${photoUrl}`;
    }

    return {
      name: rep.full_name || rep.name || '',
      district: rep.constituency || '',
      email: email,
      photo: photoUrl,
      type: 'mp',
    };
  });

  return cachedReps;
}

// Sync Australia Senators from OpenAustralia (by state)
async function syncAustraliaSenators(): Promise<CachedRep[]> {
  const apiKey = process.env.NEXT_PUBLIC_OPENAUSTRALIA_KEY?.trim();
  if (!apiKey) {
    throw new Error('OpenAustralia API key is missing');
  }

  const allSenators: CachedRep[] = [];

  // Fetch senators for each state
  for (const state of AUSTRALIA_STATES) {
    try {
      const res = await axios.get(`https://www.openaustralia.org.au/api/getSenators?key=${apiKey}&state=${state}&output=js`, { timeout: 15000 });
      const stateSenators = res.data || [];

      for (const sen of stateSenators) {
        const firstName = (sen.first_name || '').toLowerCase().replace(/[^a-z]/g, '');
        const lastName = (sen.last_name || '').toLowerCase().replace(/[^a-z]/g, '');
        const email = firstName && lastName ? `${firstName}.${lastName}@aph.gov.au` : '';

        let photoUrl = sen.image || '';
        if (photoUrl && photoUrl.startsWith('/')) {
          photoUrl = `https://www.openaustralia.org.au${photoUrl}`;
        }

        allSenators.push({
          name: sen.full_name || sen.name || '',
          district: state,
          email: email,
          photo: photoUrl,
          state: state,
          type: 'sen',
        });
      }
    } catch (e) {
      console.warn(`Failed to fetch senators for ${state}:`, e);
    }
  }

  if (allSenators.length === 0) {
    throw new Error('Could not fetch Australian senators');
  }

  return allSenators;
}

// EU country name to ISO code mapping
const EU_COUNTRY_TO_CODE: Record<string, string> = {
  'Austria': 'AT', 'Belgium': 'BE', 'Bulgaria': 'BG', 'Croatia': 'HR',
  'Cyprus': 'CY', 'Czech Republic': 'CZ', 'Czechia': 'CZ', 'Denmark': 'DK',
  'Estonia': 'EE', 'Finland': 'FI', 'France': 'FR', 'Germany': 'DE',
  'Greece': 'GR', 'Hungary': 'HU', 'Ireland': 'IE', 'Italy': 'IT',
  'Latvia': 'LV', 'Lithuania': 'LT', 'Luxembourg': 'LU', 'Malta': 'MT',
  'Netherlands': 'NL', 'Poland': 'PL', 'Portugal': 'PT', 'Romania': 'RO',
  'Slovakia': 'SK', 'Slovenia': 'SI', 'Spain': 'ES', 'Sweden': 'SE',
};

// Fetch MEP IDs from a committee/delegation page
async function fetchCommitteeMemberIds(url: string): Promise<string[]> {
  try {
    const res = await axios.get(url, { timeout: 30000 });
    const html = res.data as string;
    // Extract MEP IDs from URLs like /meps/en/124806
    const matches = html.match(/meps\/en\/(\d+)/g) || [];
    const ids: string[] = matches.map((m: string) => m.replace('meps/en/', ''));
    return [...new Set(ids)]; // Dedupe
  } catch (e) {
    console.warn(`Failed to fetch committee members from ${url}:`, e);
    return [];
  }
}

// Committee membership mapping: MEP ID -> list of committees
type CommitteeMap = Record<string, string[]>;

// Sync EU committee members (AFET, DROI, D-IR)
async function syncEUCommitteeMembers(): Promise<CommitteeMap> {
  const [afetIds, droiIds, dirIds] = await Promise.all([
    fetchCommitteeMemberIds('https://www.europarl.europa.eu/committees/en/afet/home/members'),
    fetchCommitteeMemberIds('https://www.europarl.europa.eu/committees/en/droi/home/members'),
    fetchCommitteeMemberIds('https://www.europarl.europa.eu/delegations/en/d-ir/members'),
  ]);

  // Build a map of MEP ID -> committees they belong to
  const committeeMap: CommitteeMap = {};

  for (const id of afetIds) {
    if (!committeeMap[id]) committeeMap[id] = [];
    committeeMap[id].push('AFET');
  }
  for (const id of droiIds) {
    if (!committeeMap[id]) committeeMap[id] = [];
    committeeMap[id].push('DROI');
  }
  for (const id of dirIds) {
    if (!committeeMap[id]) committeeMap[id] = [];
    committeeMap[id].push('D-IR');
  }

  console.log(`Found ${afetIds.length} AFET, ${droiIds.length} DROI, ${dirIds.length} D-IR members (${Object.keys(committeeMap).length} unique)`);
  return committeeMap;
}

// Sync EU Parliament MEPs
async function syncEUMeps(): Promise<CachedRep[]> {
  // Fetch from EU Parliament XML endpoint
  const res = await axios.get('https://www.europarl.europa.eu/meps/en/full-list/xml', {
    timeout: 60000,
    headers: {
      'Accept': 'application/xml, text/xml',
    }
  });

  const xmlData = res.data;

  if (!xmlData) {
    throw new Error('Could not fetch EU MEP data');
  }

  // Parse XML - the structure is: <meps><mep>...</mep></meps>
  // Fields: fullName, country, politicalGroup, id, nationalPoliticalGroup
  const mepMatches = xmlData.match(/<mep>([\s\S]*?)<\/mep>/g) || [];

  if (mepMatches.length === 0) {
    throw new Error('No MEP data found in XML response');
  }

  const cachedReps: CachedRep[] = [];

  for (const mepXml of mepMatches) {
    // Extract fields using regex
    const fullNameMatch = mepXml.match(/<fullName>([^<]*)<\/fullName>/);
    const countryMatch = mepXml.match(/<country>([^<]*)<\/country>/);
    const politicalGroupMatch = mepXml.match(/<politicalGroup>([^<]*)<\/politicalGroup>/);
    const idMatch = mepXml.match(/<id>([^<]*)<\/id>/);
    const nationalPartyMatch = mepXml.match(/<nationalPoliticalGroup>([^<]*)<\/nationalPoliticalGroup>/);

    const fullName = fullNameMatch ? fullNameMatch[1].trim() : '';
    const country = countryMatch ? countryMatch[1].trim() : '';
    const politicalGroup = politicalGroupMatch ? politicalGroupMatch[1].trim() : '';
    const mepId = idMatch ? idMatch[1].trim() : '';
    const nationalParty = nationalPartyMatch ? nationalPartyMatch[1].trim() : '';

    if (!fullName || !mepId) continue;

    // Get country code
    const memberState = EU_COUNTRY_TO_CODE[country] || '';

    // Construct email: firstname.lastname@europarl.europa.eu
    // Handle names like "Mika AALTOLA" -> "mika.aaltola@europarl.europa.eu"
    const nameParts = fullName.split(' ');
    let firstName = '';
    let lastName = '';

    // Find the surname (usually in CAPS) and first name
    for (const part of nameParts) {
      if (part === part.toUpperCase() && part.length > 1) {
        // This is likely the surname (all caps)
        lastName = part.toLowerCase();
      } else {
        // First name parts
        firstName = firstName ? `${firstName}-${part.toLowerCase()}` : part.toLowerCase();
      }
    }

    // Clean names for email (remove accents, special chars)
    const cleanForEmail = (str: string) => str
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // Remove accents
      .replace(/[^a-z-]/g, '') // Keep only letters and hyphens
      .replace(/-+/g, '-'); // Collapse multiple hyphens

    const emailFirstName = cleanForEmail(firstName);
    const emailLastName = cleanForEmail(lastName);
    const email = emailFirstName && emailLastName
      ? `${emailFirstName}.${emailLastName}@europarl.europa.eu`
      : '';

    // Photo URL format: https://www.europarl.europa.eu/mepphoto/{id}.jpg
    const photo = mepId ? `https://www.europarl.europa.eu/mepphoto/${mepId}.jpg` : '';

    cachedReps.push({
      name: fullName,
      district: country, // Use country as district for EU
      email: email,
      photo: photo,
      type: 'mep',
      memberState: memberState,
      politicalGroup: politicalGroup,
      nationalParty: nationalParty,
      mepId: mepId,
    });
  }

  if (cachedReps.length === 0) {
    throw new Error('Could not parse any MEP data');
  }

  return cachedReps;
}

export async function POST(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const secret = searchParams.get('secret');

    const results: Record<string, any> = {};

    // Sync France
    try {
      const franceDeputies = await syncFranceDeputies();
      await redis.set(CACHE_KEYS.FRANCE_DEPUTIES, JSON.stringify(franceDeputies), { ex: CACHE_TTL });
      results.france = { success: true, count: franceDeputies.length };
    } catch (e: any) {
      results.france = { success: false, error: e.message };
    }

    // Sync Sweden
    try {
      const swedenMPs = await syncSwedenMPs();
      await redis.set(CACHE_KEYS.SWEDEN_MPS, JSON.stringify(swedenMPs), { ex: CACHE_TTL });
      results.sweden = { success: true, count: swedenMPs.length };
    } catch (e: any) {
      results.sweden = { success: false, error: e.message };
    }

    // Sync Australia House
    try {
      const australiaHouse = await syncAustraliaHouse();
      await redis.set(CACHE_KEYS.AUSTRALIA_HOUSE, JSON.stringify(australiaHouse), { ex: CACHE_TTL });
      results.australiaHouse = { success: true, count: australiaHouse.length };
    } catch (e: any) {
      results.australiaHouse = { success: false, error: e.message };
    }

    // Sync Australia Senators
    try {
      const australiaSenators = await syncAustraliaSenators();
      await redis.set(CACHE_KEYS.AUSTRALIA_SENATORS, JSON.stringify(australiaSenators), { ex: CACHE_TTL });
      results.australiaSenators = { success: true, count: australiaSenators.length };
    } catch (e: any) {
      results.australiaSenators = { success: false, error: e.message };
    }

    // Sync EU Parliament MEPs
    try {
      const euMeps = await syncEUMeps();
      await redis.set(CACHE_KEYS.EU_MEPS, JSON.stringify(euMeps), { ex: CACHE_TTL });
      results.euMeps = { success: true, count: euMeps.length };
    } catch (e: any) {
      results.euMeps = { success: false, error: e.message };
    }

    // Sync EU committee members (AFET, DROI, D-IR)
    try {
      const committeeMap = await syncEUCommitteeMembers();
      await redis.set(CACHE_KEYS.EU_COMMITTEE_MEMBERS, JSON.stringify(committeeMap), { ex: CACHE_TTL });
      results.euCommitteeMembers = { success: true, count: Object.keys(committeeMap).length };
    } catch (e: any) {
      results.euCommitteeMembers = { success: false, error: e.message };
    }

    // Update last sync timestamp
    await redis.set(CACHE_KEYS.LAST_SYNC, new Date().toISOString());

    return NextResponse.json({
      success: true,
      results,
      syncedAt: new Date().toISOString(),
    });

  } catch (error: any) {
    console.error('Sync error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function GET() {
  try {
    const lastSync = await redis.get(CACHE_KEYS.LAST_SYNC);
    const franceData = await redis.get(CACHE_KEYS.FRANCE_DEPUTIES);
    const swedenData = await redis.get(CACHE_KEYS.SWEDEN_MPS);
    const australiaHouseData = await redis.get(CACHE_KEYS.AUSTRALIA_HOUSE);
    const australiaSenatorData = await redis.get(CACHE_KEYS.AUSTRALIA_SENATORS);
    const euMepsData = await redis.get(CACHE_KEYS.EU_MEPS);
    const euCommitteeData = await redis.get(CACHE_KEYS.EU_COMMITTEE_MEMBERS);

    // Upstash may return already parsed data or string
    const parseData = (data: any) => {
      if (!data) return [];
      if (typeof data === 'string') return JSON.parse(data);
      return data;
    };

    return NextResponse.json({
      lastSync,
      france: {
        cached: !!franceData,
        count: franceData ? parseData(franceData).length : 0,
      },
      sweden: {
        cached: !!swedenData,
        count: swedenData ? parseData(swedenData).length : 0,
      },
      australiaHouse: {
        cached: !!australiaHouseData,
        count: australiaHouseData ? parseData(australiaHouseData).length : 0,
      },
      australiaSenators: {
        cached: !!australiaSenatorData,
        count: australiaSenatorData ? parseData(australiaSenatorData).length : 0,
      },
      euMeps: {
        cached: !!euMepsData,
        count: euMepsData ? parseData(euMepsData).length : 0,
      },
      euCommitteeMembers: {
        cached: !!euCommitteeData,
        count: euCommitteeData ? parseData(euCommitteeData).length : 0,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
