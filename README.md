# Iran Eternal: The Voice of Freedom

**Iran Eternal** is an advocacy tool that helps people securely contact their elected representatives to demand international action against human rights abuses in Iran.

## Supported Countries

- 🇪🇺 **EU Parliament** — Members of European Parliament (MEPs) from AFET, DROI, and D-IR committees
- 🇨🇦 **Canada** — Member of Parliament (MP)
- 🇺🇸 **United States** — Senators and House Representatives
- 🇬🇧 **United Kingdom** — Member of Parliament (MP)
- 🇩🇪 **Germany** — Bundestag Members (MdB)
- 🇫🇷 **France** — National Assembly Deputies
- 🇸🇪 **Sweden** — Riksdag Members
- 🇦🇺 **Australia** — Members of Parliament and Senators

## Features

- **Representative Lookup** — Find your elected officials using postal/zip codes via official government APIs
- **AI-Powered Drafting** — Generates professional advocacy letters using Google Gemini
- **Privacy First** — No database, no logs. All data is ephemeral and processed in real-time

## Technical Stack

- **Framework**: [Next.js 15 (App Router)](https://nextjs.org/)
- **Styling**: [Tailwind CSS](https://tailwindcss.com/)
- **AI**: [Google Gemini SDK](https://ai.google.dev/)
- **Caching**: [Upstash Redis](https://upstash.com/) (for FR/SE/AU/EU representative data)

## API Integrations

| Country | Representative Lookup | Geo/Postal |
|---------|----------------------|------------|
| 🇪🇺 EU Parliament | [EU Parliament XML](https://www.europarl.europa.eu/meps/en/full-list/xml) | — |
| 🇨🇦 Canada | [OpenNorth Represent](https://represent.opennorth.ca/) | — |
| 🇺🇸 USA | [congress-legislators](https://github.com/unitedstates/congress-legislators) | [Geocodio](https://www.geocod.io/) |
| 🇬🇧 UK | [UK Parliament API](https://members-api.parliament.uk/) | [Postcodes.io](https://postcodes.io/) |
| 🇩🇪 Germany | [abgeordnetenwatch.de](https://www.abgeordnetenwatch.de/api) | [OpenPLZ API](https://openplzapi.org/) |
| 🇫🇷 France | [NosDéputés.fr](https://www.nosdeputes.fr/) | — |
| 🇸🇪 Sweden | [Riksdagen API](https://data.riksdagen.se/) | — |
| 🇦🇺 Australia | [OpenAustralia API](https://www.openaustralia.org.au/api/) | — |

## Privacy & Security

- **No Database** — We do not store any user data
- **No Logs** — IP addresses and inputs are never recorded
- **Client-Side Email** — Uses `mailto:` links; emails are sent from your own email client
- **Open Source** — Full codebase available for audit

### How Sending Works

- **Canada, UK, Germany, France, Sweden, Australia, EU Parliament**: Direct `mailto:` link opens your email app with the message pre-filled
- **USA**: Representatives require contact forms. The app copies your message to clipboard and opens their official `.gov` form

## Local Development

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Environment variables** — Create `.env.local`:
   ```
   GEMINI_API_KEY=your_gemini_api_key
   NEXT_PUBLIC_GEOCODIO_KEY=your_geocodio_key
   NEXT_PUBLIC_OPENAUSTRALIA_KEY=your_openaustralia_key
   UPSTASH_REDIS_REST_URL=your_upstash_url
   UPSTASH_REDIS_REST_TOKEN=your_upstash_token
   ```

   **Getting API Keys:**
   - **Gemini API**: [Google AI Studio](https://aistudio.google.com/apikey)
   - **Geocodio** (US only): [Geocodio](https://www.geocod.io/)
   - **OpenAustralia** (Australia only): [Get free key](https://www.openaustralia.org.au/api/key)
   - **Upstash Redis**: [Upstash Console](https://console.upstash.com/)

3. **Run development server**:
   ```bash
   npm run dev
   ```

4. **Sync representative data** (France, Sweden, Australia, EU Parliament):
   ```bash
   curl -X POST http://localhost:3000/api/sync-reps
   ```

## License

Open source. See repository for license details.
