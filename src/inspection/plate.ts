// Dutch licence plates. The same rules as packages/domain/src/asset.ts in the 365 Fleet portal.

// The 14 official RDW series (sidecodes) for cars, 1951 to now. Each matches a plate of 6
// characters without dashes; the groups give the dashes back as "$1-$2-$3".
const SERIES: RegExp[] = [
  /^([A-Z]|[^0-9CIOQ]{2})([0-9]{2})([0-9]{2})$/, // XX-99-99 1951
  /^([0-9]{2})([0-9]{2})([A-Z]|[^0-9CIOQ]{2})$/, // 99-99-XX 1965
  /^([0-9]{2})([A-Z]|[^0-9CIOQ]{2})([0-9]{2})$/, // 99-XX-99 1973
  /^([BDFGHJKLMNPRSTVWXYZ]{2})([0-9]{2})([BDFGHJKLMNPRSTVWXYZ]{2})$/, // XX-99-XX 1978
  /^([BDFGHJKLMNPRSTVWXZ]{2})([BDFGHJKLMNPRSTVWXZ]{2})([0-9]{2})$/, // XX-XX-99 1991
  /^([0-9]{2})([BDFGHJKLMNPRSTVWXZ]{2})([BDFGHJKLMNPRSTVWXZ]{2})$/, // 99-XX-XX 1999
  /^([0-9]{2})([BDFGHJKLMNPRSTVWXZ]{3})([0-9]{1})$/, // 99-XXX-9 2008
  /^([0-9]{1})([BDFGHJKLMNPRSTVWXZ]{3})([0-9]{2})$/, // 9-XXX-99 2013
  /^([BDFGHJKLMNPRSTVWXZ]{2})([0-9]{3})([BDFGHJKLMNPRSTVWXZ]{1})$/, // XX-999-X 2015
  /^([BDFGHJKLMNPRSTVWXZ]{1})([0-9]{3})([BDFGHJKLMNPRSTVWXZ]{2})$/, // X-999-XX 2019
  /^([BDFGHJKLMNPRSTVWXZ]{3})([0-9]{2})([BDFGHJKLMNPRSTVWXZ]{1})$/, // XXX-99-X 2024
  /^([BDFGHJKMNPRSVWXZ]{1})([0-9]{2})([BDFGHJKLMNPRSTVWXZ]{3})$/, // X-99-XXX
  /^([0-9]{1})([BDFGHJKLMNPRSTVWXZ]{2})([0-9]{3})$/, // 9-XX-999
  /^([0-9]{3})([BDFGHJKLMNPRSTVWXZ]{2})([0-9]{1})$/, // 999-XX-9
]

// Letter combinations the RDW never issues, also not inside a group of three letters.
const FORBIDDEN = /^((?!GVD|KKK|KVT|LPF|NSB|PKK|PSV|TBS|SS|SD|PVV|SGP|VVD|FVD|BBB).){8}$/

/** The Dutch plate with dashes, "AB-123-C", or null when it is not a valid Dutch plate. */
export function dutchPlate(raw: string): string | null {
  const bare = raw.toUpperCase().replace(/[^A-Z0-9]/g, '')
  const series = SERIES.find((pattern) => pattern.test(bare))
  if (!series) return null
  const formatted = bare.replace(series, '$1-$2-$3')
  return FORBIDDEN.test(formatted) ? formatted : null
}

/** For display: a Dutch plate with its dashes, anything else as it is. */
export function formatPlate(plate: string): string {
  return dutchPlate(plate) ?? plate
}
