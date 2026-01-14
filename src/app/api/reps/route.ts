export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { redis, CACHE_KEYS } from '@/lib/redis';

interface CachedRep {
  name: string;
  district: string;
  email: string;
  photo: string;
  deptCode?: string;
  valkrets?: string;
}

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

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const country = searchParams.get('country');
    const postal = searchParams.get('postal');

    if (!country || !postal) {
      return NextResponse.json({ error: 'Missing country or postal parameter' }, { status: 400 });
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
    }

    return NextResponse.json({ error: 'Unsupported country' }, { status: 400 });

  } catch (error: any) {
    console.error('Reps lookup error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
