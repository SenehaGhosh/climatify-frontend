import React, { useState, useEffect, useRef } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import "./App.css";

// Fix for default Leaflet marker icons in React
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIcon2x,
  shadowUrl: markerShadow,
});

const API_KEY = import.meta.env.VITE_OPENWEATHER_KEY;
const GROQ_API_KEY = import.meta.env.VITE_GROQ_API_KEY;

// Component to smoothly re-center map when coordinates change
function ChangeMapCenter({ center }) {
  const map = useMap();
  map.setView(center, 11);
  return null;
}

export default function App() {
  const [city, setCity] = useState("Jote Janaki");
  const [coords, setCoords] = useState({ lat: 23.6889, lon: 86.9661 });
  const [search, setSearch] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [weather, setWeather] = useState(null);
  const [aqiData, setAqiData] = useState(null);
  const [forecast, setForecast] = useState([]);
  const [loading, setLoading] = useState(false);

  // Chatbot State
  const [chatQuery, setChatQuery] = useState("");
  const [chatResponse, setChatResponse] = useState(null);
  const [chatLoading, setChatLoading] = useState(false);

  const searchRef = useRef(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (searchRef.current && !searchRef.current.contains(e.target)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Debounced Autocomplete
  useEffect(() => {
    if (!search.trim() || search.trim().length < 2) {
      setSuggestions([]);
      setShowDropdown(false);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const isZip = /^\d{6}$/.test(search.trim());
        if (isZip) {
          const zipRes = await fetch(
            `https://api.openweathermap.org/geo/1.0/zip?zip=${search.trim()},IN&appid=${API_KEY}`
          );
          if (zipRes.ok) {
            const zipData = await zipRes.json();
            setSuggestions([
              {
                name: zipData.name,
                state: `PIN ${search.trim()}`,
                country: "IN",
                lat: zipData.lat,
                lon: zipData.lon,
              },
            ]);
            setShowDropdown(true);
          }
          return;
        }

        const geoRes = await fetch(
          `https://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(
            search.trim()
          )}&limit=5&appid=${API_KEY}`
        );
        if (geoRes.ok) {
          const geoData = await geoRes.json();
          setSuggestions(geoData);
          setShowDropdown(geoData.length > 0);
        }
      } catch (err) {
        console.error("Autocomplete error:", err);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [search]);

  // Fetch Weather, AQI, and Forecast by Coordinates
  const fetchWeatherByCoords = async (lat, lon, customName) => {
    setLoading(true);
    setShowDropdown(false);
    setCoords({ lat, lon });

    try {
      // 1. Current Weather
      const weatherRes = await fetch(
        `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&units=metric&appid=${API_KEY}`
      );
      if (weatherRes.ok) {
        const weatherData = await weatherRes.json();
        setWeather({ ...weatherData, customName });
        setCity(customName);
      }

      // 2. Air Pollution / AQI Endpoint
      const aqiRes = await fetch(
        `https://api.openweathermap.org/data/2.5/air_pollution?lat=${lat}&lon=${lon}&appid=${API_KEY}`
      );
      if (aqiRes.ok) {
        const pollutionData = await aqiRes.json();
        if (pollutionData.list && pollutionData.list.length > 0) {
          setAqiData(pollutionData.list[0]);
        }
      }

      // 3. Forecast
      const forecastRes = await fetch(
        `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&units=metric&appid=${API_KEY}`
      );
      if (forecastRes.ok) {
        const forecastData = await forecastRes.json();
        setForecast(forecastData.list.slice(0, 4));
      }
    } catch (err) {
      console.error("Error fetching metrics:", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchWeatherData = async (queryLocation) => {
    setLoading(true);
    setShowDropdown(false);

    try {
      let lat, lon;
      let displayTitle = queryLocation;
      const isZip = /^\d{6}$/.test(queryLocation.trim());

      if (isZip) {
        const zipRes = await fetch(
          `https://api.openweathermap.org/geo/1.0/zip?zip=${queryLocation.trim()},IN&appid=${API_KEY}`
        );
        if (zipRes.ok) {
          const zipData = await zipRes.json();
          lat = zipData.lat;
          lon = zipData.lon;
          displayTitle = `${zipData.name} (PIN ${queryLocation.trim()})`;
        }
      }

      if (!lat || !lon) {
        const geoRes = await fetch(
          `https://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(
            queryLocation
          )},IN&limit=1&appid=${API_KEY}`
        );
        if (geoRes.ok) {
          const geoData = await geoRes.json();
          if (geoData && geoData.length > 0) {
            lat = geoData[0].lat;
            lon = geoData[0].lon;
          }
        }
      }

      // Fallback coordinates (Paschim Bardhaman region)
      if (!lat || !lon) {
        lat = 23.6889;
        lon = 86.9661;
      }

      await fetchWeatherByCoords(lat, lon, displayTitle);
    } catch (err) {
      console.error("Error in fetchWeatherData:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWeatherData(city);
  }, []);

  const handleSelectSuggestion = (item) => {
    setSearch("");
    setShowDropdown(false);
    fetchWeatherByCoords(item.lat, item.lon, item.name);
  };

  const searchCity = () => {
    if (search.trim() !== "") {
      const newCity = search.trim();
      setCity(newCity);
      fetchWeatherData(newCity);
      setSearch("");
      setShowDropdown(false);
    }
  };

  const getAqiDetails = (index) => {
    switch (index) {
      case 1:
        return { label: "Good", class: "aqi-good" };
      case 2:
        return { label: "Fair", class: "aqi-fair" };
      case 3:
        return { label: "Moderate", class: "aqi-moderate" };
      case 4:
        return { label: "Poor", class: "aqi-poor" };
      case 5:
        return { label: "Very Poor", class: "aqi-very-poor" };
      default:
        return { label: "Moderate", class: "aqi-moderate" };
    }
  };

  const calculateFloodRisk = () => {
    if (!weather)
      return { score: 42, label: "Moderate Risk", levelClass: "moderate", rain: 12 };
    const rain = weather.rain ? weather.rain["1h"] || weather.rain["3h"] || 0 : 0;
    const humidity = weather.main?.humidity || 60;

    let score = Math.min(100, Math.round(rain * 15 + humidity * 0.4));
    if (score > 70) return { score, label: "High Risk", levelClass: "high", rain };
    if (score > 35) return { score, label: "Moderate Risk", levelClass: "moderate", rain };
    return { score, label: "Low Risk", levelClass: "low", rain };
  };

  // Real LLM Assistant Call via Groq API
  const askAI = async () => {
    if (!chatQuery.trim()) return;
    const userPrompt = chatQuery.trim();
    setChatQuery("");
    setChatLoading(true);

    const riskInfo = calculateFloodRisk();
    const aqiInfo = getAqiDetails(aqiData?.main?.aqi || 3);

    const systemPrompt = `You are Climatify AI, a concise climate and weather safety assistant.
Location: ${city}, West Bengal, India.
Current Temperature: ${Math.round(weather?.main?.temp || 28)}°C (Feels like ${Math.round(
      weather?.main?.feels_like || 30
    )}°C)
Condition: ${weather?.weather[0]?.description || "Partly Cloudy"}
Humidity: ${weather?.main?.humidity || 70}%
Wind Speed: ${Math.round((weather?.wind?.speed || 5) * 3.6)} km/h
Rainfall: ${riskInfo.rain} mm
Flood Risk Level: ${riskInfo.label} (${riskInfo.score}%)
Air Quality Index (AQI): ${aqiInfo.label} (PM2.5: ${
      aqiData?.components?.pm2_5 || "N/A"
    } µg/m³)

Provide a helpful, direct answer in 2 to 3 sentences based on this context.`;

    try {
      if (GROQ_API_KEY) {
        const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${GROQ_API_KEY}`,
          },
          body: JSON.stringify({
            model: "llama-3.3-70b-versatile",
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userPrompt },
            ],
            temperature: 0.6,
            max_tokens: 150,
          }),
        });

        if (res.ok) {
          const data = await res.json();
          setChatResponse(data.choices[0].message.content);
          return;
        }
      }

      setChatResponse(
        `Climatify AI: Currently in ${city}, temperature is ${Math.round(
          weather?.main?.temp || 28
        )}°C with ${weather?.main?.humidity}% humidity and ${aqiInfo.label} air quality.`
      );
    } catch (err) {
      console.error("LLM Error:", err);
      setChatResponse(
        "Climatify AI is temporarily unable to process your request. Please try again."
      );
    } finally {
      setChatLoading(false);
    }
  };

  const riskInfo = calculateFloodRisk();
  const aqiInfo = getAqiDetails(aqiData?.main?.aqi || 3);

  return (
    <div className="app">
      {/* HEADER */}
      <header className="header">
        <div className="logo">☁️ Climatify</div>
        <div className="live">
          <span></span>
          LIVE
        </div>
      </header>

      {/* MAIN */}
      <main className="main">
        {/* HERO */}
        <section className="hero">
          <p>AI POWERED CLIMATE ASSISTANT</p>
          <h1>
            Understand your weather.
            <br />
            <span>Stay one step ahead.</span>
          </h1>
          <div className="subtitle">
            Real-time weather insights, air quality, and flood risk information for any location.
          </div>
        </section>

        {/* SEARCH WITH AUTOCOMPLETE */}
        <div className="search-container" ref={searchRef}>
          <div className="search-box">
            <span>🔍</span>
            <input
              type="text"
              placeholder="Search a city, village, or PIN code..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onFocus={() => {
                if (suggestions.length > 0) setShowDropdown(true);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") searchCity();
              }}
            />
            <button onClick={searchCity}>Search</button>
          </div>

          {showDropdown && suggestions.length > 0 && (
            <ul className="autocomplete-dropdown">
              {suggestions.map((item, idx) => (
                <li key={idx} onClick={() => handleSelectSuggestion(item)}>
                  <span className="loc-icon">📍</span>
                  <div className="loc-text">
                    <strong>{item.name}</strong>
                    <small>
                      {item.state ? `${item.state}, ` : ""}
                      {item.country}
                    </small>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* LOCATION HEADER */}
        <div className="location">
          <div>
            <h2>{city}</h2>
            <p>West Bengal, India</p>
            <small>
              {loading ? "Updating climate metrics..." : "Weather data updated live"}
            </small>
          </div>
          <div className="live-weather">
            <span></span>
            Live Weather
          </div>
        </div>

        {/* WEATHER CARDS GRID */}
        <div className="weather-grid">
          <div className="weather-card">
            <div className="icon">☁️</div>
            <p>Condition</p>
            <h3>{weather ? weather.weather[0].main : "Cloudy"}</h3>
            <small className="capitalize">
              {weather ? weather.weather[0].description : "Partly cloudy skies"}
            </small>
          </div>

          <div className="weather-card">
            <div className="icon">🌡️</div>
            <p>Temperature</p>
            <h3>{weather ? `${Math.round(weather.main.temp)}°C` : "28°C"}</h3>
            <small>Feels like {weather ? `${Math.round(weather.main.feels_like)}°C` : "30°C"}</small>
          </div>

          <div className="weather-card">
            <div className="icon">💨</div>
            <p>Wind Speed</p>
            <h3>{weather ? `${Math.round(weather.wind.speed * 3.6)} km/h` : "18 km/h"}</h3>
            <small>Moderate wind</small>
          </div>

          <div className="weather-card">
            <div className="icon">💧</div>
            <p>Humidity</p>
            <h3>{weather ? `${weather.main.humidity}%` : "82%"}</h3>
            <small>High humidity</small>
          </div>
        </div>

        {/* INTERACTIVE REGIONAL MAP */}
        <section className="map-card">
          <div className="map-header">
            <p>SATELLITE RADAR</p>
            <h2>Live Weather & Regional Map</h2>
          </div>
          <div className="leaflet-wrapper">
            <MapContainer
              center={[coords.lat, coords.lon]}
              zoom={11}
              scrollWheelZoom={false}
              style={{ height: "300px", width: "100%", borderRadius: "16px" }}
            >
              <ChangeMapCenter center={[coords.lat, coords.lon]} />
              
              {/* Clean Base Map (100% Free, Reliable at All Zoom Levels) */}
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />

              <Marker position={[coords.lat, coords.lon]}>
                <Popup>
                  <strong>{city}</strong>
                  <br />
                  Temp: {weather ? `${Math.round(weather.main.temp)}°C` : "28°C"}
                </Popup>
              </Marker>
            </MapContainer>
          </div>
        </section>

        {/* AIR QUALITY INDEX (AQI) CARD */}
        <section className="aqi-card">
          <div className="aqi-top">
            <div>
              <p>ENVIRONMENTAL MONITORING</p>
              <h2>Air Quality Index (AQI)</h2>
            </div>
            <div className={`aqi-badge ${aqiInfo.class}`}>{aqiInfo.label}</div>
          </div>

          <div className="aqi-pollutants">
            <div>
              <span>PM₂.₅</span>
              <strong>
                {aqiData ? `${Math.round(aqiData.components.pm2_5)} µg/m³` : "18 µg/m³"}
              </strong>
            </div>
            <div>
              <span>PM₁₀</span>
              <strong>
                {aqiData ? `${Math.round(aqiData.components.pm10)} µg/m³` : "42 µg/m³"}
              </strong>
            </div>
            <div>
              <span>NO₂</span>
              <strong>
                {aqiData ? `${Math.round(aqiData.components.no2)} µg/m³` : "15 µg/m³"}
              </strong>
            </div>
            <div>
              <span>O₃</span>
              <strong>
                {aqiData ? `${Math.round(aqiData.components.o3)} µg/m³` : "28 µg/m³"}
              </strong>
            </div>
          </div>
        </section>

        {/* FLOOD MONITORING */}
        <section className="flood-card">
          <div className="flood-top">
            <div>
              <p>FLOOD MONITORING</p>
              <h2>Flood Risk Status</h2>
            </div>
            <div className={`risk ${riskInfo.levelClass}`}>{riskInfo.label}</div>
          </div>

          <div className="flood-content">
            <div className="risk-circle">
              <strong>{riskInfo.score}%</strong>
              <small>Risk Score</small>
            </div>

            <div className="risk-bar-container">
              <div className="risk-bar">
                <div className="risk-fill" style={{ width: `${riskInfo.score}%` }}></div>
              </div>
              <div className="risk-labels">
                <span>Low</span>
                <span>Moderate</span>
                <span>High</span>
              </div>
            </div>

            <div className="risk-info">
              <div>
                <span>🌧️ Rainfall</span>
                <strong>{riskInfo.rain} mm</strong>
              </div>
              <div>
                <span>🌊 Water Level</span>
                <strong>Moderate</strong>
              </div>
              <div>
                <span>💨 Wind Speed</span>
                <strong>
                  {weather ? `${Math.round(weather.wind.speed * 3.6)} km/h` : "18 km/h"}
                </strong>
              </div>
            </div>
          </div>
        </section>

        {/* WEATHER OVERVIEW */}
        <section className="overview-card">
          <div className="overview-header">
            <div>
              <p>WEATHER OVERVIEW</p>
              <h2>Today's Conditions</h2>
            </div>
            <span>24 Hours</span>
          </div>

          <div className="overview-items">
            {forecast.length > 0 ? (
              forecast.map((item, index) => {
                const date = new Date(item.dt * 1000);
                const hours = date.getHours().toString().padStart(2, "0") + ":00";
                return (
                  <div key={index}>
                    <small>{hours}</small>
                    <strong>{Math.round(item.main.temp)}°C</strong>
                    <span className="capitalize">{item.weather[0].main}</span>
                  </div>
                );
              })
            ) : (
              <>
                <div>
                  <small>Morning</small>
                  <strong>24°C</strong>
                  <span>☁️ Cloudy</span>
                </div>
                <div>
                  <small>Afternoon</small>
                  <strong>29°C</strong>
                  <span>🌧️ Rain</span>
                </div>
                <div>
                  <small>Evening</small>
                  <strong>27°C</strong>
                  <span>🌦️ Showers</span>
                </div>
                <div>
                  <small>Night</small>
                  <strong>25°C</strong>
                  <span>☁️ Cloudy</span>
                </div>
              </>
            )}
          </div>
        </section>

        {/* AI RECOMMENDATION */}
        <section className="recommendation">
          <div className="recommendation-icon">💡</div>
          <div>
            <p>AI RECOMMENDATION</p>
            <h3>
              {weather && weather.main.humidity > 75
                ? "Carry an umbrella if you are going outside."
                : "Enjoy pleasant outdoor weather today."}
            </h3>
            <span>
              {weather && weather.main.humidity > 75
                ? "Rain probability is currently high. Avoid low-lying areas during heavy rainfall."
                : "Weather conditions are stable across the region."}
            </span>
          </div>
        </section>

        {/* REAL LLM CHATBOT */}
        <section className="chatbot">
          <div className="chat-heading">
            <div className="bot">🤖</div>
            <div>
              <h2>Climatify AI Assistant</h2>
              <p>Ask anything about weather, AQI, or flood risk.</p>
            </div>
          </div>

          {chatLoading && (
            <div
              className="chat-response-box"
              style={{
                background: "#0f172a",
                padding: "12px",
                borderRadius: "8px",
                margin: "10px 0",
                borderLeft: "4px solid #38bdf8",
                color: "#94a3b8",
              }}
            >
              <p>Thinking and analyzing climate metrics...</p>
            </div>
          )}

          {chatResponse && !chatLoading && (
            <div
              className="chat-response-box"
              style={{
                background: "#0f172a",
                padding: "12px",
                borderRadius: "8px",
                margin: "10px 0",
                borderLeft: "4px solid #38bdf8",
              }}
            >
              <p>{chatResponse}</p>
            </div>
          )}

          <div className="chat-input">
            <input
              type="text"
              placeholder="Ask: Is it safe to cycle outside this evening?"
              value={chatQuery}
              onChange={(e) => setChatQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") askAI();
              }}
            />
            <button onClick={askAI} disabled={chatLoading}>
              {chatLoading ? "..." : "➤"}
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}