// Open data of the RDW, the Dutch vehicle registry: free, no key and no account. Only the
// licence plate leaves the app, and only the date of first admission and the name come back.
const RDW_URL = 'https://opendata.rdw.nl/resource/m9d7-ebf2.json'

export type RdwVehicle = {
  /** The year of first admission, anywhere: for an imported car earlier than in the Netherlands. */
  buildYear: number
  /** Make and model as the RDW writes them, for example "PEUGEOT EXPERT". */
  name: string
}

type RdwRow = { datum_eerste_toelating?: string; merk?: string; handelsbenaming?: string }

/** The vehicle of a Dutch plate (without dashes), or null when the RDW does not know it. */
export async function fetchRdwVehicle(plateKey: string, signal?: AbortSignal): Promise<RdwVehicle | null> {
  const query = new URLSearchParams({
    kenteken: plateKey,
    $select: 'datum_eerste_toelating,merk,handelsbenaming',
  })
  const response = await fetch(`${RDW_URL}?${query}`, { signal })
  if (!response.ok) throw new Error(`RDW answered ${response.status}`)

  const [row] = (await response.json()) as RdwRow[]
  // The date is written as YYYYMMDD.
  const year = Number(row?.datum_eerste_toelating?.slice(0, 4))
  if (!Number.isInteger(year) || year < 1900) return null
  return { buildYear: year, name: [row.merk, row.handelsbenaming].filter(Boolean).join(' ') }
}
