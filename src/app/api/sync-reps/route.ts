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

    // Upstash may return already parsed data or string
    const parseFranceData = (data: any) => {
      if (!data) return [];
      if (typeof data === 'string') return JSON.parse(data);
      return data;
    };

    return NextResponse.json({
      lastSync,
      france: {
        cached: !!franceData,
        count: franceData ? parseFranceData(franceData).length : 0,
      },
      sweden: {
        cached: !!swedenData,
        count: swedenData ? parseFranceData(swedenData).length : 0,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
