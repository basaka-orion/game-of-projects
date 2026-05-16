export type SimplifyAmbient = 'dawn' | 'day' | 'dusk' | 'night'

export type SimplifyWeatherCondition = 'clear' | 'cloudy' | 'rain' | 'fog' | 'snow' | 'storm'

export type SimplifyEnvironmentSource = 'manual-location' | 'authorized-location' | 'timezone' | 'fallback'

export type SimplifyEnvironmentEffect =
  | 'sunrise'
  | 'sunlight'
  | 'sunset'
  | 'stars'
  | 'clouds'
  | 'rain'
  | 'mist'
  | 'snow'
  | 'storm'

export interface SimplifyEnvironmentLocation {
  latitude: number
  longitude: number
  label: string
  source: Extract<SimplifyEnvironmentSource, 'manual-location' | 'authorized-location'>
}

export interface SimplifyEnvironment {
  timeOfDay: SimplifyAmbient
  weatherCondition: SimplifyWeatherCondition
  locationLabel: string
  temperature: number | null
  updatedAt: string
  source: SimplifyEnvironmentSource
  degraded: boolean
  effects: SimplifyEnvironmentEffect[]
  message: string
}

interface OpenMeteoCurrentWeather {
  current?: {
    temperature_2m?: number
    weather_code?: number
    is_day?: number
    time?: string
  }
}

interface OpenMeteoGeocodingResult {
  name?: string
  country?: string
  admin1?: string
  latitude?: number
  longitude?: number
}

interface OpenMeteoGeocodingResponse {
  results?: OpenMeteoGeocodingResult[]
}

export interface LoadSimplifyEnvironmentOptions {
  now?: Date
  location?: SimplifyEnvironmentLocation | null
  fetcher?: typeof fetch
}

export function getSimplifyAmbient(now: Date = new Date()): SimplifyAmbient {
  const hour = now.getHours()
  const minute = now.getMinutes()
  const currentMinutes = hour * 60 + minute

  if (!Number.isFinite(currentMinutes)) return 'day'
  if (currentMinutes >= 5 * 60 && currentMinutes < 8 * 60) return 'dawn'
  if (currentMinutes >= 8 * 60 && currentMinutes < 17 * 60) return 'day'
  if (currentMinutes >= 17 * 60 && currentMinutes < 20 * 60) return 'dusk'
  return 'night'
}

export function weatherConditionFromCode(code: number | null | undefined): SimplifyWeatherCondition {
  if (code === undefined || code === null || !Number.isFinite(code)) return 'clear'
  if (code === 0 || code === 1) return 'clear'
  if (code === 2 || code === 3) return 'cloudy'
  if (code === 45 || code === 48) return 'fog'
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return 'rain'
  if ((code >= 71 && code <= 77) || (code >= 85 && code <= 86)) return 'snow'
  if (code >= 95) return 'storm'
  return 'cloudy'
}

export function getSimplifyEnvironment(
  now: Date = new Date(),
  input: Partial<Pick<SimplifyEnvironment, 'weatherCondition' | 'temperature' | 'locationLabel' | 'source' | 'degraded'>> = {},
): SimplifyEnvironment {
  const timeOfDay = getSimplifyAmbient(now)
  const weatherCondition = input.weatherCondition || 'clear'
  const effects = new Set<SimplifyEnvironmentEffect>()

  if (timeOfDay === 'dawn') effects.add('sunrise')
  if (timeOfDay === 'day') effects.add('sunlight')
  if (timeOfDay === 'dusk') effects.add('sunset')
  if (timeOfDay === 'night') effects.add('stars')

  if (weatherCondition === 'cloudy') effects.add('clouds')
  if (weatherCondition === 'rain') effects.add('rain')
  if (weatherCondition === 'fog') effects.add('mist')
  if (weatherCondition === 'snow') effects.add('snow')
  if (weatherCondition === 'storm') effects.add('storm')

  const source = input.source || 'timezone'
  const degraded = Boolean(input.degraded)
  return {
    timeOfDay,
    weatherCondition,
    locationLabel: input.locationLabel || resolveTimezoneLabel(),
    temperature: typeof input.temperature === 'number' && Number.isFinite(input.temperature) ? input.temperature : null,
    updatedAt: now.toISOString(),
    source,
    degraded,
    effects: Array.from(effects),
    message: degraded ? '天气暂未同步，先使用本地时间环境。' : environmentMessage(timeOfDay, weatherCondition, source),
  }
}

export async function loadSimplifyEnvironment(options: LoadSimplifyEnvironmentOptions = {}): Promise<SimplifyEnvironment> {
  const now = options.now || new Date()
  const location = options.location || null
  if (!location) return getSimplifyEnvironment(now)

  try {
    const fetcher = options.fetcher || fetch
    const url = new URL('https://api.open-meteo.com/v1/forecast')
    url.searchParams.set('latitude', String(location.latitude))
    url.searchParams.set('longitude', String(location.longitude))
    url.searchParams.set('current', 'temperature_2m,weather_code,is_day')
    url.searchParams.set('timezone', 'auto')

    const response = await fetcher(url.toString())
    if (!response.ok) throw new Error(`weather_http_${response.status}`)
    const payload = (await response.json()) as OpenMeteoCurrentWeather
    const condition = weatherConditionFromCode(payload.current?.weather_code)
    return getSimplifyEnvironment(now, {
      weatherCondition: condition,
      temperature: payload.current?.temperature_2m,
      locationLabel: location.label,
      source: location.source,
      degraded: false,
    })
  } catch {
    return getSimplifyEnvironment(now, {
      locationLabel: location.label,
      source: location.source,
      degraded: true,
    })
  }
}

export async function resolveSimplifyManualLocation(
  city: string,
  fetcher: typeof fetch = fetch,
): Promise<SimplifyEnvironmentLocation | null> {
  const name = city.trim()
  if (!name) return null
  const url = new URL('https://geocoding-api.open-meteo.com/v1/search')
  url.searchParams.set('name', name)
  url.searchParams.set('count', '1')
  url.searchParams.set('language', 'zh')
  url.searchParams.set('format', 'json')

  const response = await fetcher(url.toString())
  if (!response.ok) throw new Error(`geocoding_http_${response.status}`)
  const payload = (await response.json()) as OpenMeteoGeocodingResponse
  const result = payload.results?.[0]
  if (!result || typeof result.latitude !== 'number' || typeof result.longitude !== 'number') return null
  return {
    latitude: result.latitude,
    longitude: result.longitude,
    label: [result.name, result.admin1, result.country].filter(Boolean).join(' · ') || name,
    source: 'manual-location',
  }
}

function resolveTimezoneLabel(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || '本地时间'
  } catch {
    return '本地时间'
  }
}

function environmentMessage(
  ambient: SimplifyAmbient,
  condition: SimplifyWeatherCondition,
  source: SimplifyEnvironmentSource,
): string {
  const timeLabel: Record<SimplifyAmbient, string> = {
    dawn: '晨光',
    day: '日光',
    dusk: '黄昏',
    night: '夜间',
  }
  const weatherLabel: Record<SimplifyWeatherCondition, string> = {
    clear: '晴朗',
    cloudy: '云层',
    rain: '雨意',
    fog: '薄雾',
    snow: '雪光',
    storm: '风暴',
  }
  const sourceLabel = source === 'timezone' ? '系统时区' : '地区天气'
  return `${sourceLabel} · ${timeLabel[ambient]} · ${weatherLabel[condition]}`
}
