import { ChatGroq } from '@langchain/groq';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { getStore } from './data';

export interface ParsedRoute {
  origin: string | null;
  destination: string | null;
  cities: string[] | null;
  stayDurations: Record<string, number> | null;
}

const cache = new Map<string, ParsedRoute>();

const ROUTE_PROMPT = ChatPromptTemplate.fromTemplate(`
Extract the flight origin, destination, and intermediate cities/stay durations from this travel request.
The traveler's home airport is {homeAirport}.
Known airport codes: {knownCodes}.

Request: "{requestText}"

Rules:
- "home" or "go home" or "return home" means the traveler's home airport ({homeAirport}).
- "from X" means X is the ORIGIN. "to X" or just naming a city as a target means DESTINATION.
- "via X" or visiting a list of cities in a sequence means intermediate cities in a multi-city route.
- If it is a multi-city route (visiting 2 or more intermediate cities, e.g. "visit London, Paris, and Rome"), set "cities" to the list of IATA codes in travel order, and set "origin" and "destination" to null.
- If it is a single-leg flight (A to B), set "cities" to null, and identify "origin" and "destination". If origin is not mentioned, default "origin" to {homeAirport}.
- Only use airport codes from the known list. If you cannot confidently determine a code, use null.
- Also extract any per-city stay durations in nights if mentioned (e.g. "3 nights in Rome", "stay in CDG for 2 days"). Return the durations as a JSON record mapping the airport code to the number of nights.

Respond with ONLY this JSON object, no other text or explanation:
{{"origin": "XXX" | null, "destination": "XXX" | null, "cities": ["XXX", "YYY"] | null, "stayDurations": {{"XXX": 2}} | null}}
`);

export async function parseRouteWithLLM(
  requestText: string,
  homeAirport: string,
): Promise<ParsedRoute | null> {
  const cacheKey = `${homeAirport}:${requestText.trim()}`;
  if (cache.has(cacheKey)) {
    return cache.get(cacheKey)!;
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return null;

  try {
    const store = getStore();
    const knownCodes = [...store.airports.keys()].join(', ');
    const model = new ChatGroq({
      apiKey,
      model: 'llama-3.3-70b-versatile',
      temperature: 0,
    });

    const chain = ROUTE_PROMPT.pipe(model).pipe(new StringOutputParser());
    const responseText = await chain.invoke({
      requestText,
      homeAirport,
      knownCodes,
    });

    let jsonText = responseText.trim();
    if (jsonText.includes('{')) {
      jsonText = jsonText.substring(jsonText.indexOf('{'), jsonText.lastIndexOf('}') + 1);
    }

    const parsed = JSON.parse(jsonText);

    // Validate origin and destination codes
    if (parsed.origin && !store.airports.has(parsed.origin)) {
      parsed.origin = null;
    }
    if (parsed.destination && !store.airports.has(parsed.destination)) {
      parsed.destination = null;
    }

    // Validate multi-city list
    if (parsed.cities && Array.isArray(parsed.cities)) {
      parsed.cities = parsed.cities.filter((code: string) => store.airports.has(code));
      if (parsed.cities.length < 2) {
        parsed.cities = null;
      }
    } else {
      parsed.cities = null;
    }

    // Clean up stay durations
    if (parsed.stayDurations) {
      const validatedStays: Record<string, number> = {};
      for (const [code, val] of Object.entries(parsed.stayDurations)) {
        if (store.airports.has(code)) {
          validatedStays[code] = typeof val === 'number' ? val : parseInt(val as string, 10) || 2;
        }
      }
      parsed.stayDurations = Object.keys(validatedStays).length > 0 ? validatedStays : null;
    } else {
      parsed.stayDurations = null;
    }

    const result: ParsedRoute = {
      origin: parsed.origin || null,
      destination: parsed.destination || null,
      cities: parsed.cities || null,
      stayDurations: parsed.stayDurations || null,
    };

    cache.set(cacheKey, result);
    return result;
  } catch (error) {
    console.error('[Route LLM Parser Error]', error);
    return null;
  }
}
