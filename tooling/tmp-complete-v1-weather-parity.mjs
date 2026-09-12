import { readFile, writeFile } from "node:fs/promises";

async function replaceInFile(path, replacements) {
  let text = await readFile(path, "utf8");
  for (const [from, to, label] of replacements) {
    if (!text.includes(from)) throw new Error(`Missing patch anchor: ${label}`);
    text = text.replace(from, to);
  }
  await writeFile(path, text);
}

await replaceInFile(
  "apps/morro-digital-platform/src/weather/weather-widget.ts",
  [
    [
      "  readonly forecast: readonly WeatherForecastDay[];\n",
      "  readonly forecast?: readonly WeatherForecastDay[];\n",
      "optional forecast contract",
    ],
    [
      `    activeModal?.close();\n    activeModal = openWeatherForecastModal({ document, reading: latestReading });\n    widget.setAttribute(\"aria-expanded\", \"true\");\n\n    const close = activeModal.close;\n    activeModal = Object.freeze({\n      element: activeModal.element,\n      close(): void {\n        close();\n        widget.setAttribute(\"aria-expanded\", \"false\");\n        activeModal = undefined;\n      },\n    });\n`,
      `    activeModal?.close();\n    activeModal = openWeatherForecastModal({\n      document,\n      reading: latestReading,\n      onClose: () => {\n        widget.setAttribute(\"aria-expanded\", \"false\");\n        activeModal = undefined;\n      },\n    });\n    widget.setAttribute(\"aria-expanded\", \"true\");\n`,
      "weather modal lifecycle",
    ],
  ],
);

await replaceInFile(
  "apps/morro-digital-platform/src/weather/weather-forecast-modal.ts",
  [
    [
      "  readonly reading: WeatherReading;\n}",
      "  readonly reading: WeatherReading;\n  readonly onClose?: () => void;\n}",
      "modal onClose option",
    ],
    [
      "  return reading.forecast.length > 0 ? reading.forecast : [todayFallback(reading)];",
      "  return reading.forecast && reading.forecast.length > 0\n    ? reading.forecast\n    : [todayFallback(reading)];",
      "optional forecast fallback",
    ],
    [
      "  reading,\n}: WeatherForecastModalOptions): WeatherForecastModalController {",
      "  reading,\n  onClose,\n}: WeatherForecastModalOptions): WeatherForecastModalController {",
      "modal onClose destructure",
    ],
    [
      "    modal.remove();\n    previouslyFocused?.focus();\n",
      "    modal.remove();\n    onClose?.();\n    previouslyFocused?.focus();\n",
      "modal lifecycle callback",
    ],
  ],
);

await replaceInFile(
  "apps/morro-digital-platform/tooling/dev-server.mjs",
  [
    [
      `  return {\n    temperatureCelsius,\n    temperatureMaxCelsius: today.tempmax,\n    temperatureMinCelsius: today.tempmin,\n    humidityPercent: current.humidity,\n    windSpeedKph: current.windspeed,\n    rainChancePercent: today.precipprob,\n    weatherCode: conditionToWeatherCode(current?.conditions || icon),\n    isDay: !icon.includes(\"night\"),\n    provider: \"visual-crossing\",\n  };\n`,
      `  const forecast = Array.isArray(payload?.days)\n    ? payload.days.slice(0, 7).flatMap((day) => {\n        if (\n          typeof day?.datetime !== \"string\" ||\n          typeof day?.tempmax !== \"number\" ||\n          typeof day?.tempmin !== \"number\" ||\n          typeof day?.humidity !== \"number\" ||\n          typeof day?.windspeed !== \"number\" ||\n          typeof day?.precipprob !== \"number\"\n        ) {\n          return [];\n        }\n        return [{\n          date: day.datetime,\n          temperatureMaxCelsius: day.tempmax,\n          temperatureMinCelsius: day.tempmin,\n          humidityPercent: day.humidity,\n          windSpeedKph: day.windspeed,\n          rainChancePercent: day.precipprob,\n          weatherCode: conditionToWeatherCode(day?.conditions || day?.icon),\n        }];\n      })\n    : [];\n\n  return {\n    temperatureCelsius,\n    temperatureMaxCelsius: today.tempmax,\n    temperatureMinCelsius: today.tempmin,\n    humidityPercent: current.humidity,\n    windSpeedKph: current.windspeed,\n    rainChancePercent: today.precipprob,\n    weatherCode: conditionToWeatherCode(current?.conditions || icon),\n    isDay: !icon.includes(\"night\"),\n    forecast,\n    provider: \"visual-crossing\",\n  };\n`,
      "Visual Crossing forecast",
    ],
    [
      '    "temperature_2m_max,temperature_2m_min,precipitation_probability_max",',
      '    "temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code,relative_humidity_2m_max,wind_speed_10m_max",',
      "Open-Meteo daily fields",
    ],
    [
      `  return {\n    temperatureCelsius: current.temperature_2m,\n    temperatureMaxCelsius: daily.temperature_2m_max[0],\n    temperatureMinCelsius: daily.temperature_2m_min[0],\n    humidityPercent: current.relative_humidity_2m,\n    windSpeedKph: current.wind_speed_10m,\n    rainChancePercent: daily.precipitation_probability_max[0],\n    weatherCode: current.weather_code,\n    isDay: current.is_day === 1,\n    provider: \"open-meteo\",\n  };\n`,
      `  const forecast = Array.isArray(daily?.time)\n    ? daily.time.slice(0, 7).flatMap((date, index) => {\n        const temperatureMax = daily?.temperature_2m_max?.[index];\n        const temperatureMin = daily?.temperature_2m_min?.[index];\n        const rainChance = daily?.precipitation_probability_max?.[index];\n        const weatherCode = daily?.weather_code?.[index];\n        const humidity = daily?.relative_humidity_2m_max?.[index];\n        const windSpeed = daily?.wind_speed_10m_max?.[index];\n        if (\n          typeof date !== \"string\" ||\n          typeof temperatureMax !== \"number\" ||\n          typeof temperatureMin !== \"number\" ||\n          typeof rainChance !== \"number\" ||\n          typeof weatherCode !== \"number\" ||\n          typeof humidity !== \"number\" ||\n          typeof windSpeed !== \"number\"\n        ) {\n          return [];\n        }\n        return [{\n          date,\n          temperatureMaxCelsius: temperatureMax,\n          temperatureMinCelsius: temperatureMin,\n          humidityPercent: humidity,\n          windSpeedKph: windSpeed,\n          rainChancePercent: rainChance,\n          weatherCode,\n        }];\n      })\n    : [];\n\n  return {\n    temperatureCelsius: current.temperature_2m,\n    temperatureMaxCelsius: daily.temperature_2m_max[0],\n    temperatureMinCelsius: daily.temperature_2m_min[0],\n    humidityPercent: current.relative_humidity_2m,\n    windSpeedKph: current.wind_speed_10m,\n    rainChancePercent: daily.precipitation_probability_max[0],\n    weatherCode: current.weather_code,\n    isDay: current.is_day === 1,\n    forecast,\n    provider: \"open-meteo\",\n  };\n`,
      "Open-Meteo forecast",
    ],
  ],
);
