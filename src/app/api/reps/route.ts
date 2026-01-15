export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import axios from 'axios';
import { redis, CACHE_KEYS, CACHE_TTL } from '@/lib/redis';

interface CachedRep {
  name: string;
  district: string;
  email: string;
  photo: string;
  deptCode?: string;
  valkrets?: string;
  state?: string;
  type?: string;
  // EU MEP specific fields
  memberState?: string;
  politicalGroup?: string;
  nationalParty?: string;
  mepId?: string;
}

// Helper function to map Australian postcode to state
const getStateFromPostcode = (postcode: string): string | null => {
  const code = parseInt(postcode);

  // ACT: 0200-0299, 2600-2639 (must check before NSW to avoid overlap)
  if ((code >= 200 && code <= 299) || (code >= 2600 && code <= 2639)) {
    return 'ACT';
  }
  // NSW: 1000-2599, 2640-2999
  if ((code >= 1000 && code <= 2599) || (code >= 2640 && code <= 2999)) {
    return 'NSW';
  }
  // VIC: 3000-3999, 8000-8999
  if ((code >= 3000 && code <= 3999) || (code >= 8000 && code <= 8999)) {
    return 'Victoria';
  }
  // QLD: 4000-4999, 9000-9999
  if ((code >= 4000 && code <= 4999) || (code >= 9000 && code <= 9999)) {
    return 'Queensland';
  }
  // SA: 5000-5999
  if (code >= 5000 && code <= 5999) {
    return 'SA';
  }
  // WA: 6000-6999
  if (code >= 6000 && code <= 6999) {
    return 'WA';
  }
  // TAS: 7000-7999
  if (code >= 7000 && code <= 7999) {
    return 'Tasmania';
  }
  // NT: 0800-0999
  if (code >= 800 && code <= 999) {
    return 'NT';
  }

  return null;
};

// Mapping of Swedish postal code prefixes to electoral districts
const SWEDEN_POSTAL_TO_VALKRETS: Record<string, string> = {
  // Stockholm area
  '10': 'Stockholms kommun', '11': 'Stockholms kommun', '12': 'Stockholms kommun',
  '13': 'Stockholms län', '14': 'Stockholms län', '15': 'Stockholms län',
  '16': 'Stockholms län', '17': 'Stockholms län', '18': 'Stockholms län', '19': 'Stockholms län',
  // Uppsala
  '74': 'Uppsala län', '75': 'Uppsala län', '76': 'Uppsala län',
  // Södermanland
  '61': 'Södermanlands län', '63': 'Södermanlands län', '64': 'Södermanlands län',
  // Östergötland
  '58': 'Östergötlands län', '59': 'Östergötlands län', '60': 'Östergötlands län',
  // Jönköping
  '33': 'Jönköpings län', '34': 'Jönköpings län', '56': 'Jönköpings län',
  // Kronoberg
  '35': 'Kronobergs län', '36': 'Kronobergs län',
  // Kalmar
  '38': 'Kalmar län', '39': 'Kalmar län', '57': 'Kalmar län',
  // Gotland
  '62': 'Gotlands län',
  // Blekinge
  '37': 'Blekinge län',
  // Skåne
  '20': 'Malmö kommun', '21': 'Malmö kommun',
  '22': 'Skåne läns södra', '23': 'Skåne läns södra', '24': 'Skåne läns södra',
  '25': 'Skåne läns västra', '26': 'Skåne läns västra',
  '27': 'Skåne läns norra och östra', '28': 'Skåne läns norra och östra', '29': 'Skåne läns norra och östra',
  // Halland
  '30': 'Hallands län', '31': 'Hallands län', '32': 'Hallands län',
  // Västra Götaland
  '40': 'Göteborgs kommun', '41': 'Göteborgs kommun', '42': 'Göteborgs kommun',
  '43': 'Västra Götalands läns västra', '44': 'Västra Götalands läns västra', '45': 'Västra Götalands läns västra',
  '46': 'Västra Götalands läns norra', '47': 'Västra Götalands läns norra',
  '50': 'Västra Götalands läns östra', '51': 'Västra Götalands läns östra', '52': 'Västra Götalands läns östra',
  '53': 'Västra Götalands läns södra', '54': 'Västra Götalands läns södra',
  // Värmland
  '65': 'Värmlands län', '66': 'Värmlands län', '67': 'Värmlands län', '68': 'Värmlands län', '69': 'Värmlands län',
  // Örebro
  '70': 'Örebro län', '71': 'Örebro län',
  // Västmanland
  '72': 'Västmanlands län', '73': 'Västmanlands län',
  // Dalarna
  '77': 'Dalarnas län', '78': 'Dalarnas län', '79': 'Dalarnas län', '80': 'Dalarnas län',
  // Gävleborg
  '81': 'Gävleborgs län', '82': 'Gävleborgs län',
  // Jämtland
  '83': 'Jämtlands län', '84': 'Jämtlands län',
  // Västernorrland
  '85': 'Västernorrlands län', '86': 'Västernorrlands län', '87': 'Västernorrlands län', '88': 'Västernorrlands län', '89': 'Västernorrlands län',
  // Västerbotten
  '90': 'Västerbottens län', '91': 'Västerbottens län', '92': 'Västerbottens län', '93': 'Västerbottens län',
  // Norrbotten
  '94': 'Norrbottens län', '95': 'Norrbottens län', '96': 'Norrbottens län', '97': 'Norrbottens län', '98': 'Norrbottens län',
};

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

// Fetch committee member IDs from EU Parliament website
async function fetchCommitteeMemberIds(url: string): Promise<string[]> {
  try {
    const res = await axios.get(url, { timeout: 30000 });
    const html = res.data as string;
    const matches = html.match(/meps\/en\/(\d+)/g) || [];
    const ids: string[] = matches.map((m: string) => m.replace('meps/en/', ''));
    return [...new Set(ids)];
  } catch (e) {
    console.warn(`Failed to fetch committee members from ${url}:`, e);
    return [];
  }
}

// Committee membership mapping: MEP ID -> list of committees
type CommitteeMap = Record<string, string[]>;

// Auto-sync EU committee members if cache is empty
async function syncCommitteeMembersIfNeeded(): Promise<CommitteeMap> {
  const existing = await redis.get(CACHE_KEYS.EU_COMMITTEE_MEMBERS);
  if (existing) {
    const data = typeof existing === 'string' ? JSON.parse(existing) : existing;
    // Check if it's the new format (object) with enough entries
    if (data && typeof data === 'object' && !Array.isArray(data) && Object.keys(data).length > 50) {
      return data as CommitteeMap;
    }
  }

  // Fetch from all three committees/delegations
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

  console.log(`Synced committee members: ${afetIds.length} AFET, ${droiIds.length} DROI, ${dirIds.length} D-IR (${Object.keys(committeeMap).length} unique)`);

  if (Object.keys(committeeMap).length > 0) {
    await redis.set(CACHE_KEYS.EU_COMMITTEE_MEMBERS, JSON.stringify(committeeMap), { ex: CACHE_TTL });
  }

  return committeeMap;
}

// Get EU MEPs from cache (scraped emails are populated by sync-reps endpoint)
async function getEUMepsFromCache(): Promise<CachedRep[]> {
  const existing = await redis.get(CACHE_KEYS.EU_MEPS);
  if (existing) {
    const data = typeof existing === 'string' ? JSON.parse(existing) : existing;
    if (Array.isArray(data) && data.length > 0) {
      return data as CachedRep[];
    }
  }
  // Cache is empty - return empty array
  // User should call /api/sync-reps?type=eu to populate the cache with scraped emails
  console.log('EU MEP cache is empty. Call /api/sync-reps?type=eu to populate.');
  return [];
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const country = searchParams.get('country');
    const postal = searchParams.get('postal');
    const memberState = searchParams.get('memberState');

    if (!country) {
      return NextResponse.json({ error: 'Missing country parameter' }, { status: 400 });
    }

    // EU uses memberState instead of postal
    if (country === 'EU') {
      if (!memberState) {
        return NextResponse.json({ error: 'Missing memberState parameter' }, { status: 400 });
      }

      // Validate member state code
      const validMemberStates = [
        'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR',
        'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL',
        'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE'
      ];

      if (!validMemberStates.includes(memberState.toUpperCase())) {
        return NextResponse.json({ error: 'Invalid EU member state code' }, { status: 400 });
      }

      // Get MEPs from cache (populated by /api/sync-reps?type=eu)
      const [allMeps, committeeMap] = await Promise.all([
        getEUMepsFromCache(),
        syncCommitteeMembersIfNeeded(),
      ]);

      // Filter by member state AND committee membership (AFET, DROI, or D-IR)
      let filtered = allMeps.filter((mep: CachedRep) =>
        mep.memberState === memberState.toUpperCase() &&
        mep.mepId &&
        committeeMap[mep.mepId]
      );

      // Limit to max 10 random MEPs to prevent spam flagging
      if (filtered.length > 10) {
        // Fisher-Yates shuffle
        for (let i = filtered.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [filtered[i], filtered[j]] = [filtered[j], filtered[i]];
        }
        filtered = filtered.slice(0, 10);
      }

      if (filtered.length === 0) {
        return NextResponse.json({
          error: `No MEPs found for ${memberState} in AFET, DROI, or Iran Delegation committees`
        }, { status: 404 });
      }

      return NextResponse.json({
        reps: filtered.map((mep: CachedRep) => ({
          name: mep.name,
          district: mep.district, // Country name
          email: mep.email,
          photo: mep.photo,
          country: 'EU',
          title: 'Member of European Parliament',
          type: 'mep',
          party: mep.politicalGroup,
          memberState: mep.memberState,
          committee: mep.mepId ? committeeMap[mep.mepId]?.join(', ') : undefined,
          contactForm: mep.mepId ? `https://www.europarl.europa.eu/meps/en/${mep.mepId}` : undefined,
        })),
      });
    }

    // All other countries require postal code
    if (!postal) {
      return NextResponse.json({ error: 'Missing postal parameter' }, { status: 400 });
    }

    if (country === 'FR') {
      // France lookup
      const cleanPostal = postal.trim().replace(/\s/g, '');
      if (!/^\d{5}$/.test(cleanPostal)) {
        return NextResponse.json({ error: 'Invalid French postal code format' }, { status: 400 });
      }

      // Extract department code
      let deptCode = cleanPostal.substring(0, 2);
      if (deptCode === '20') {
        deptCode = parseInt(cleanPostal) < 20200 ? '2A' : '2B';
      } else if (cleanPostal.startsWith('97')) {
        deptCode = cleanPostal.substring(0, 3);
      }

      // Get cached data
      const cachedData = await redis.get(CACHE_KEYS.FRANCE_DEPUTIES);
      if (!cachedData) {
        return NextResponse.json({
          error: 'Data not cached. Please run sync first.',
          needsSync: true
        }, { status: 503 });
      }

      // Upstash may return already parsed data or string
      const allDeputies: CachedRep[] = typeof cachedData === 'string' ? JSON.parse(cachedData) : cachedData;
      const filtered = allDeputies.filter(d => d.deptCode === deptCode);

      if (filtered.length === 0) {
        return NextResponse.json({
          error: `No deputies found for department ${deptCode}`
        }, { status: 404 });
      }

      return NextResponse.json({
        reps: filtered.map(d => ({
          name: d.name,
          district: d.district,
          email: d.email,
          photo: d.photo,
          country: 'FR',
          title: 'Député(e)',
          type: 'mp',
        })),
      });

    } else if (country === 'SE') {
      // Sweden lookup
      const cleanPostal = postal.trim().replace(/\s/g, '');
      if (!/^\d{5}$/.test(cleanPostal)) {
        return NextResponse.json({ error: 'Invalid Swedish postal code format' }, { status: 400 });
      }

      const prefix = cleanPostal.substring(0, 2);
      const valkrets = SWEDEN_POSTAL_TO_VALKRETS[prefix];

      if (!valkrets) {
        return NextResponse.json({
          error: 'Could not determine electoral district from postal code'
        }, { status: 400 });
      }

      // Get cached data
      const cachedData = await redis.get(CACHE_KEYS.SWEDEN_MPS);
      if (!cachedData) {
        return NextResponse.json({
          error: 'Data not cached. Please run sync first.',
          needsSync: true
        }, { status: 503 });
      }

      // Upstash may return already parsed data or string
      const allMPs: CachedRep[] = typeof cachedData === 'string' ? JSON.parse(cachedData) : cachedData;
      const filtered = allMPs.filter(mp => mp.valkrets === valkrets);

      if (filtered.length === 0) {
        return NextResponse.json({
          error: `No MPs found for ${valkrets}`
        }, { status: 404 });
      }

      return NextResponse.json({
        reps: filtered.map(mp => ({
          name: mp.name,
          district: mp.district,
          email: mp.email,
          photo: mp.photo,
          country: 'SE',
          title: 'Riksdagsledamot',
          type: 'mp',
        })),
      });

    } else if (country === 'AU') {
      // Australia lookup
      const cleanPostal = postal.trim();
      if (!/^\d{4}$/.test(cleanPostal)) {
        return NextResponse.json({ error: 'Invalid Australian postcode format' }, { status: 400 });
      }

      // Map postcode to state
      const state = getStateFromPostcode(cleanPostal);
      if (!state) {
        return NextResponse.json({ error: 'Could not determine state from postcode' }, { status: 400 });
      }

      // Get cached data
      const houseData = await redis.get(CACHE_KEYS.AUSTRALIA_HOUSE);
      const senatorData = await redis.get(CACHE_KEYS.AUSTRALIA_SENATORS);

      if (!houseData || !senatorData) {
        return NextResponse.json({
          error: 'Data not cached. Please run sync first.',
          needsSync: true
        }, { status: 503 });
      }

      // Parse data
      const allHouse: CachedRep[] = typeof houseData === 'string' ? JSON.parse(houseData) : houseData;
      const allSenators: CachedRep[] = typeof senatorData === 'string' ? JSON.parse(senatorData) : senatorData;

      // Filter senators by state
      const stateSenators = allSenators.filter(s => s.state === state);

      // For House MPs, we need to do a postcode lookup via OpenAustralia API
      // since the cached data doesn't have postcode mapping
      // Instead, return all House MPs and let client filter, or call API for specific postcode
      // For now, we'll call the OpenAustralia API for the specific postcode House MPs
      const apiKey = process.env.NEXT_PUBLIC_OPENAUSTRALIA_KEY?.trim();
      if (!apiKey) {
        return NextResponse.json({ error: 'OpenAustralia API key is missing' }, { status: 500 });
      }

      let houseMPs: any[] = [];
      try {
        const axios = (await import('axios')).default;
        const houseRes = await axios.get(`https://www.openaustralia.org.au/api/getRepresentatives?key=${apiKey}&postcode=${cleanPostal}&output=js`, { timeout: 10000 });
        houseMPs = houseRes.data || [];
      } catch (e) {
        console.warn('Failed to fetch House MPs for postcode:', e);
      }

      const reps = [
        // House MPs from API call (specific to postcode)
        ...houseMPs.map((rep: any) => {
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
            country: 'AU',
            title: 'Member of Parliament',
            type: 'mp',
          };
        }),
        // Senators from cache (filtered by state)
        ...stateSenators.map(s => ({
          name: s.name,
          district: s.district,
          email: s.email,
          photo: s.photo,
          country: 'AU',
          title: 'Senator',
          type: 'sen',
        })),
      ];

      if (reps.length === 0) {
        return NextResponse.json({
          error: 'No representatives found for this postcode'
        }, { status: 404 });
      }

      return NextResponse.json({ reps });
    }

    return NextResponse.json({ error: 'Unsupported country' }, { status: 400 });

  } catch (error: any) {
    console.error('Reps lookup error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
