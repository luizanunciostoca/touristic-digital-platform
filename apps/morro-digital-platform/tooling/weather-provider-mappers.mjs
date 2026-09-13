export function conditionToWeatherCode(condition) {
  const value = String(condition || "").toLowerCase();
  if (value.includes("thunder")) return 95;
  if (value.includes("snow") || value.includes("sleet")) return 71;
  if (value.includes("rain") || value.includes("drizzle")) return 61;
  if (value.includes("fog") || value.includes("mist")) return 45;
  if (value.includes("overcast")) return 3;
  if (value.includes("cloud") || value.includes("partially")) return 2;
  return 0;
}

export function mapVisualCrossingWeatherPayload(payload) {
  const current = payload?.currentConditions;
  const today = payload?.days?.[0];
  const temperatureCelsius = current?.temp;
  if (typeof temperatureCelsius !== "number") {
    throw new Error("Visual Crossing returned incomplete current conditions.");
  }

  const icon = String(current?.icon || "");
  if (
    typeof today?.tempmax !== "number" ||
    typeof today?.tempmin !== "number" ||
    typeof current?.humidity !== "number" ||
    typeof current?.windspeed !== "number" ||
    typeof today?.precipprob !== "number"
  ) {
    throw new Error("Visual Crossing returned incomplete weather details.");
  }

  const forecast = Array.isArray(payload?.days)
    ? payload.days.slice(0, 7).flatMap((day) => {
        if (
          typeof day?.datetime !== "string" ||
          typeof day?.tempmax !== "number" ||
          typeof day?.tempmin !== "number" ||
          typeof day?.humidity !== "number" ||
          typeof day?.windspeed !== "number" ||
          typeof day?.precipprob !== "number"
        ) {
          return [];
        }
        return [
          {
            date: day.datetime,
            temperatureMaxCelsius: day.tempmax,
            temperatureMinCelsius: day.tempmin,
            humidityPercent: day.humidity,
            windSpeedKph: day.windspeed,
            rainChancePercent: day.precipprob,
            weatherCode: conditionToWeatherCode(day?.conditions || day?.icon),
          },
        ];
      })
    : [];

  return {
    temperatureCelsius,
    temperatureMaxCelsius: today.tempmax,
    temperatureMinCelsius: today.tempmin,
    humidityPercent: current.humidity,
    windSpeedKph: current.windspeed,
    rainChancePercent: today.precipprob,
    weatherCode: conditionToWeatherCode(current?.conditions || icon),
    isDay: !icon.includes("night"),
    forecast,
    provider: "visual-crossing",
  };
}

function openMeteoDailyHumidityMaximums(payload) {
  const times = payload?.hourly?.time;
  const values = payload?.hourly?.relative_humidity_2m;
  const humidityByDate = new Map();
  if (!Array.isArray(times) || !Array.isArray(values)) return humidityByDate;

  for (
    let index = 0;
    index < Math.min(times.length, values.length);
    index += 1
  ) {
    const time = times[index];
    const humidity = values[index];
    if (
      typeof time !== "string" ||
      typeof humidity !== "number" ||
      !Number.isFinite(humidity)
    ) {
      continue;
    }
    const date = time.slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/u.test(date)) continue;
    const previous = humidityByDate.get(date);
    if (typeof previous !== "number" || humidity > previous) {
      humidityByDate.set(date, humidity);
    }
  }

  return humidityByDate;
}

export function mapOpenMeteoWeatherPayload(payload) {
  const current = payload?.current;
  const daily = payload?.daily;
  if (
    typeof current?.temperature_2m !== "number" ||
    typeof current?.relative_humidity_2m !== "number" ||
    typeof current?.wind_speed_10m !== "number" ||
    typeof daily?.temperature_2m_max?.[0] !== "number" ||
    typeof daily?.temperature_2m_min?.[0] !== "number" ||
    typeof daily?.precipitation_probability_max?.[0] !== "number" ||
    typeof current?.weather_code !== "number" ||
    (current?.is_day !== 0 && current?.is_day !== 1)
  ) {
    throw new Error("Open-Meteo returned incomplete current conditions.");
  }

  const humidityByDate = openMeteoDailyHumidityMaximums(payload);
  const forecast = Array.isArray(daily?.time)
    ? daily.time.slice(0, 7).flatMap((date, index) => {
        const temperatureMax = daily?.temperature_2m_max?.[index];
        const temperatureMin = daily?.temperature_2m_min?.[index];
        const rainChance = daily?.precipitation_probability_max?.[index];
        const weatherCode = daily?.weather_code?.[index];
        const humidity =
          typeof date === "string" ? humidityByDate.get(date) : undefined;
        const windSpeed = daily?.wind_speed_10m_max?.[index];
        if (
          typeof date !== "string" ||
          typeof temperatureMax !== "number" ||
          typeof temperatureMin !== "number" ||
          typeof rainChance !== "number" ||
          typeof weatherCode !== "number" ||
          typeof humidity !== "number" ||
          typeof windSpeed !== "number"
        ) {
          return [];
        }
        return [
          {
            date,
            temperatureMaxCelsius: temperatureMax,
            temperatureMinCelsius: temperatureMin,
            humidityPercent: humidity,
            windSpeedKph: windSpeed,
            rainChancePercent: rainChance,
            weatherCode,
          },
        ];
      })
    : [];

  return {
    temperatureCelsius: current.temperature_2m,
    temperatureMaxCelsius: daily.temperature_2m_max[0],
    temperatureMinCelsius: daily.temperature_2m_min[0],
    humidityPercent: current.relative_humidity_2m,
    windSpeedKph: current.wind_speed_10m,
    rainChancePercent: daily.precipitation_probability_max[0],
    weatherCode: current.weather_code,
    isDay: current.is_day === 1,
    forecast,
    provider: "open-meteo",
  };
}

export async function fetchWeatherWithFallback({
  visualCrossingKey,
  fetchVisualCrossing,
  fetchOpenMeteo,
  onRecovered = () => undefined,
  onDegraded = () => undefined,
}) {
  if (visualCrossingKey) {
    try {
      const weather = await fetchVisualCrossing(visualCrossingKey);
      onRecovered("weather-visual-crossing");
      return weather;
    } catch (error) {
      onDegraded("weather-visual-crossing", error);
    }
  }

  try {
    const weather = await fetchOpenMeteo();
    onRecovered("weather-open-meteo");
    return weather;
  } catch (error) {
    onDegraded("weather-open-meteo", error);
    throw error;
  }
}
