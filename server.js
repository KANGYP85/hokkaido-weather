// ================================================
// 道北旅遊天氣後端 server.js v2
// 混合架構：Open-Meteo（城市細緻天氣）+ 氣象廳（官方警報）
// ================================================

const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  next();
});

app.use(express.static(path.join(__dirname, 'public')));

// 景點資料庫
const { recommendSpots } = require('./spots');

// ================================================
// 城市資料（Open-Meteo 用經緯度）
// ================================================
const CITIES = {
  asahikawa: { name: '旭川', lat: 43.77,  lon: 142.36, jma: '012000' },
  biei:      { name: '美瑛', lat: 43.584, lon: 142.464, jma: '012000' },
  furano:    { name: '富良野', lat: 43.34, lon: 142.38, jma: '012000' },
};

// ================================================
// Open-Meteo 天氣代碼 → 繁體中文
// ================================================
const WMO_MAP = {
  0:  { label: '晴天',     emoji: '☀️',  level: 'clear' },
  1:  { label: '大致晴',   emoji: '🌤️', level: 'clear' },
  2:  { label: '部分多雲', emoji: '⛅',  level: 'cloudy' },
  3:  { label: '陰天',     emoji: '☁️',  level: 'cloudy' },
  45: { label: '霧',       emoji: '🌫️', level: 'cloudy' },
  48: { label: '霧淞',     emoji: '🌫️', level: 'cloudy' },
  51: { label: '毛毛雨',   emoji: '🌦️', level: 'rain' },
  53: { label: '小雨',     emoji: '🌦️', level: 'rain' },
  55: { label: '中雨',     emoji: '🌧️', level: 'rain' },
  61: { label: '小雨',     emoji: '🌧️', level: 'rain' },
  63: { label: '中雨',     emoji: '🌧️', level: 'rain' },
  65: { label: '大雨',     emoji: '🌧️', level: 'rain' },
  71: { label: '小雪',     emoji: '❄️',  level: 'snow' },
  73: { label: '中雪',     emoji: '🌨️', level: 'snow' },
  75: { label: '大雪',     emoji: '🌨️', level: 'heavy_snow' },
  77: { label: '雪粒',     emoji: '🌨️', level: 'snow' },
  80: { label: '陣雨',     emoji: '🌦️', level: 'rain' },
  81: { label: '中陣雨',   emoji: '🌧️', level: 'rain' },
  82: { label: '大陣雨',   emoji: '🌧️', level: 'rain' },
  85: { label: '陣雪',     emoji: '🌨️', level: 'snow' },
  86: { label: '大陣雪',   emoji: '🌨️', level: 'heavy_snow' },
  95: { label: '雷雨',     emoji: '⛈️',  level: 'rain' },
  96: { label: '雷雨夾雹', emoji: '⛈️',  level: 'rain' },
  99: { label: '大雷雨',   emoji: '⛈️',  level: 'rain' },
};

function getWMO(code) {
  return WMO_MAP[code] || { label: '查詢中', emoji: '🌡️', level: 'unknown' };
}

// ================================================
// 旅遊建議生成（核心功能）
// ================================================
function generateAdvice(city, weather) {
  const { temp, feelsLike, windSpeed, snowfall, rain, level } = weather;
  const tips = [];
  let activityOk = true;
  let driveOk = true;

  // 氣溫判斷
  if (temp <= -10) tips.push('今日嚴寒，外出請穿羽絨外套＋手套＋帽子');
  else if (temp <= 0) tips.push('氣溫在冰點附近，路面可能結冰，早晚尤其注意');
  else if (temp <= 5) tips.push('天氣偏冷，建議穿厚外套');

  // 體感溫度
  if (feelsLike <= -15) tips.push(`體感溫度 ${feelsLike}°C，風很大，減少長時間戶外活動`);

  // 風速
  if (windSpeed >= 15) {
    tips.push(`風速 ${windSpeed}m/s，山區與海邊體感更冷，注意防風`);
    driveOk = false;
  } else if (windSpeed >= 10) {
    tips.push(`有明顯風速，美瑛丘陵開車請注意側風`);
  }

  // 降雪
  if (snowfall >= 5) {
    tips.push(`降雪量 ${snowfall}mm，開車請預留額外時間，確認雪胎狀態`);
    driveOk = false;
    activityOk = false;
  } else if (snowfall > 0) {
    tips.push(`有少量降雪，路面可能有積雪，行走請穿防滑靴`);
  }

  // 降雨
  if (rain >= 5) {
    tips.push('今日有雨，建議攜帶雨具，戶外行程可考慮調整');
    activityOk = false;
  }

  // 天氣狀況
  if (level === 'heavy_snow') {
    tips.push('大雪中，建議優先安排室內景點');
    activityOk = false;
    driveOk = false;
  } else if (level === 'blizzard') {
    tips.push('暴風雪警戒，強烈建議不要外出自駕');
    activityOk = false;
    driveOk = false;
  }

  // 城市特定建議
  if (city === 'biei' && (level === 'snow' || level === 'heavy_snow')) {
    tips.push('美瑛丘陵道路積雪，拍照請在安全範圍內停車');
  }
  if (city === 'asahikawa' && level === 'clear') {
    tips.push('今日天氣適合，旭山動物園戶外展區全開');
  }

  // 綜合判斷
  let summary = '';
  if (!activityOk && !driveOk) {
    summary = '今日建議以室內活動為主，避免長途自駕';
  } else if (!driveOk) {
    summary = '可外出觀光，但自駕請謹慎，留意路況';
  } else if (!activityOk) {
    summary = '天氣不佳，建議安排室內景點或溫泉';
  } else {
    summary = '今日天氣適合出遊，請仍注意保暖';
  }

  return { tips, summary, activityOk, driveOk };
}

// ================================================
// 氣象廳警報解析
// ================================================
const JMA_WARNING_MAP = {
  '大雪': { label: '大雪注意報', type: 'warn', icon: '🌨️' },
  '暴風雪': { label: '暴風雪警報', type: 'danger', icon: '🚨' },
  '風雪': { label: '風雪注意報', type: 'warn', icon: '🌬️' },
  '濃霧': { label: '濃霧注意報', type: 'info', icon: '🌫️' },
  '雪崩': { label: '雪崩注意報', type: 'warn', icon: '⛰️' },
  '融雪': { label: '融雪注意報', type: 'info', icon: '💧' },
  '強風': { label: '強風注意報', type: 'warn', icon: '💨' },
};

async function fetchJMAAlerts(jmaCode) {
  try {
    const url = `https://www.jma.go.jp/bosai/forecast/data/overview_forecast/${jmaCode}.json`;
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const data = await res.json();
    const text = data?.text || '';

    const alerts = [];
    for (const [key, val] of Object.entries(JMA_WARNING_MAP)) {
      if (text.includes(key)) {
        alerts.push(val);
      }
    }
    return alerts;
  } catch {
    return [];
  }
}

// ================================================
// 主要 API：單一城市
// ================================================
app.get('/api/city', async (req, res) => {
  const cityKey = req.query.city || 'asahikawa';
  const city = CITIES[cityKey] || CITIES.asahikawa;

  try {
    // Open-Meteo API
    const omUrl = `https://api.open-meteo.com/v1/forecast?latitude=${city.lat}&longitude=${city.lon}` +
      `&current=temperature_2m,apparent_temperature,weathercode,windspeed_10m,precipitation,snowfall,cloudcover,relativehumidity_2m` +
      `&hourly=temperature_2m,snowfall,precipitation&timezone=Asia%2FTokyo&forecast_days=1`;

    const [omRes, jmaAlerts] = await Promise.all([
      fetch(omUrl),
      fetchJMAAlerts(city.jma),
    ]);

    const omData = await omRes.json();
    const cur = omData.current;
    const hourly = omData.hourly;

    const wmo = getWMO(cur.weathercode);

    const weather = {
      temp:       Math.round(cur.temperature_2m),
      feelsLike:  Math.round(cur.apparent_temperature),
      windSpeed:  Math.round(cur.windspeed_10m),
      snowfall:   Math.round(cur.snowfall * 10) / 10,
      rain:       Math.round(cur.precipitation * 10) / 10,
      humidity:   cur.relativehumidity_2m,
      cloudcover: cur.cloudcover,
      emoji:      wmo.emoji,
      label:      wmo.label,
      level:      wmo.level,
    };

    // 未來 6 小時降雪趨勢
    const now = new Date();
    const nowHour = now.getHours();
    const snowTrend = hourly.snowfall
      ?.slice(nowHour, nowHour + 6)
      ?.map((s, i) => ({ hour: `${nowHour + i}時`, snow: s })) || [];

    // 未來 6 小時降雨趨勢
    const rainTrend = hourly.precipitation
      ?.slice(nowHour, nowHour + 6)
      ?.map((r, i) => ({ hour: `${nowHour + i}時`, rain: Math.round(r * 10) / 10 })) || [];

    const advice = generateAdvice(cityKey, weather);

    // 根據天氣從資料庫動態推薦景點
    const now2 = new Date();
    const month = now2.getMonth() + 1;
    const isWinter = month >= 11 || month <= 3;

    const recommendedSpots = recommendSpots(weather.level, {
      city: cityKey,
      winter: isWinter,
      limit: 4,
    });

    res.json({
      city: city.name,
      spots: recommendedSpots,
      updatedAt: new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Tokyo' }),
      weather,
      advice,
      snowTrend,
      rainTrend,
      jmaAlerts,
    });

  } catch (err) {
    console.error(`City API Error [${cityKey}]:`, err.message);
    res.status(500).json({ error: '無法取得天氣資料', detail: err.message });
  }
});

// ================================================
// 全城市一次抓（給總覽頁面用）
// ================================================
app.get('/api/all-cities', async (req, res) => {
  try {
    const results = await Promise.all(
      Object.keys(CITIES).map(async (key) => {
        const r = await fetch(`http://localhost:${PORT}/api/city?city=${key}`);
        return r.json();
      })
    );
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 健康檢查
app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.listen(PORT, () => {
  console.log(`✅ 道北天氣 v2 啟動 http://localhost:${PORT}`);
});
