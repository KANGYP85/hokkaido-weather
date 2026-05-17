// ================================================
// 道北旅遊天氣後端 server.js
// 執行方式: node server.js
// 需要: Node.js 18+ (內建 fetch)
// ================================================

const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

// 允許前端跨域呼叫
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  next();
});

// 提供靜態前端檔案
app.use(express.static(path.join(__dirname, 'public')));

// ================================================
// 道北各地區代碼對照表
// ================================================
const AREA_CODES = {
  asahikawa: { code: '016000', name: '旭川・上川' },
  furano:    { code: '016000', name: '富良野・美瑛' },
  wakkanai:  { code: '017000', name: '稚內・宗谷' },
  nayoro:    { code: '017000', name: '名寄・士別' },
  rumoi:     { code: '012000', name: '留萌・增毛' },
};

// ================================================
// 天氣代碼 → 繁體中文 + Emoji 對照表
// ================================================
const WEATHER_CODE_MAP = {
  100: { label: '晴天',       emoji: '☀️',  level: 'clear' },
  101: { label: '晴時多雲',   emoji: '🌤️', level: 'clear' },
  102: { label: '晴時有雨',   emoji: '🌦️', level: 'rain' },
  103: { label: '晴有雨或雪', emoji: '🌨️', level: 'snow' },
  110: { label: '晴轉多雲',   emoji: '⛅',  level: 'cloudy' },
  111: { label: '晴轉多雲',   emoji: '⛅',  level: 'cloudy' },
  112: { label: '晴轉有雨',   emoji: '🌦️', level: 'rain' },
  115: { label: '晴轉有雪',   emoji: '🌨️', level: 'snow' },
  200: { label: '多雲',       emoji: '☁️',  level: 'cloudy' },
  201: { label: '多雲時晴',   emoji: '⛅',  level: 'cloudy' },
  202: { label: '多雲偶有雨', emoji: '🌦️', level: 'rain' },
  203: { label: '多雲有雨或雪',emoji: '🌨️',level: 'snow' },
  205: { label: '多雲偶有雪', emoji: '🌨️', level: 'snow' },
  206: { label: '多雲有雪或雨',emoji: '🌨️',level: 'snow' },
  207: { label: '多雲有時雪', emoji: '🌨️', level: 'snow' },
  209: { label: '霧',         emoji: '🌫️', level: 'cloudy' },
  210: { label: '多雲轉雨',   emoji: '🌧️', level: 'rain' },
  211: { label: '多雲轉雨後晴',emoji: '🌧️',level: 'rain' },
  212: { label: '多雲轉雨',   emoji: '🌧️', level: 'rain' },
  215: { label: '多雲轉雪',   emoji: '❄️',  level: 'snow' },
  300: { label: '有雨',       emoji: '🌧️', level: 'rain' },
  301: { label: '雨後晴',     emoji: '🌦️', level: 'rain' },
  302: { label: '陣雨',       emoji: '🌧️', level: 'rain' },
  303: { label: '雨或雪',     emoji: '🌨️', level: 'snow' },
  304: { label: '大雨',       emoji: '🌧️', level: 'rain' },
  308: { label: '暴風雨',     emoji: '⛈️',  level: 'rain' },
  309: { label: '雨後雪',     emoji: '🌨️', level: 'snow' },
  311: { label: '雨後轉多雲', emoji: '🌦️', level: 'rain' },
  313: { label: '雨後雪',     emoji: '🌨️', level: 'snow' },
  314: { label: '雨後轉多雲', emoji: '🌦️', level: 'rain' },
  400: { label: '有雪',       emoji: '❄️',  level: 'snow' },
  401: { label: '雪或雨',     emoji: '🌨️', level: 'snow' },
  402: { label: '大雪',       emoji: '🌨️', level: 'heavy_snow' },
  403: { label: '大雪或雨',   emoji: '🌨️', level: 'heavy_snow' },
  405: { label: '大雪',       emoji: '🌨️', level: 'heavy_snow' },
  406: { label: '暴風雪',     emoji: '🌨️', level: 'blizzard' },
  407: { label: '暴風大雪',   emoji: '⛈️',  level: 'blizzard' },
  409: { label: '雪後雨',     emoji: '🌨️', level: 'snow' },
  411: { label: '雪後晴',     emoji: '🌨️', level: 'snow' },
  413: { label: '雪後雨',     emoji: '🌨️', level: 'snow' },
  414: { label: '雪後轉多雲', emoji: '🌨️', level: 'snow' },
  420: { label: '雪後多雲',   emoji: '❄️',  level: 'snow' },
  421: { label: '雪後晴',     emoji: '❄️',  level: 'snow' },
  422: { label: '雪後雨',     emoji: '🌨️', level: 'snow' },
};

function getWeatherInfo(code) {
  return WEATHER_CODE_MAP[code] || { label: '查詢中', emoji: '🌡️', level: 'unknown' };
}

// ================================================
// 計算安全指數（根據天氣狀況推算）
// ================================================
function calcSafetyIndex(weatherLevel, tempMin) {
  let iceRisk = 0;
  let driveScore = 100;

  if (weatherLevel === 'blizzard') { iceRisk = 90; driveScore = 10; }
  else if (weatherLevel === 'heavy_snow') { iceRisk = 75; driveScore = 30; }
  else if (weatherLevel === 'snow') { iceRisk = 55; driveScore = 55; }
  else if (weatherLevel === 'rain') { iceRisk = 20; driveScore = 75; }
  else { iceRisk = 10; driveScore = 90; }

  // 氣溫越低，黑冰風險越高
  if (tempMin !== null) {
    if (tempMin < -10) iceRisk = Math.min(100, iceRisk + 20);
    else if (tempMin < -5) iceRisk = Math.min(100, iceRisk + 10);
    else if (tempMin > 0) iceRisk = Math.max(0, iceRisk - 15);
  }

  // 能見度指數（暴風雪最差）
  const visibility = weatherLevel === 'blizzard' ? 20
    : weatherLevel === 'heavy_snow' ? 45
    : weatherLevel === 'snow' ? 65
    : 90;

  // 道路通行率
  const roadOpen = weatherLevel === 'blizzard' ? 40
    : weatherLevel === 'heavy_snow' ? 65
    : 95;

  return { iceRisk, driveScore, visibility, roadOpen };
}

// ================================================
// 主要 API：取得天氣資料
// ================================================
app.get('/api/weather', async (req, res) => {
  const area = req.query.area || 'asahikawa';
  const areaInfo = AREA_CODES[area] || AREA_CODES.asahikawa;

  try {
    // 1. 取得天氣預報
    const forecastUrl = `https://www.jma.go.jp/bosai/forecast/data/forecast/${areaInfo.code}.json`;
    const overviewUrl = `https://www.jma.go.jp/bosai/forecast/data/overview_forecast/${areaInfo.code}.json`;

    const [forecastRes, overviewRes] = await Promise.all([
      fetch(forecastUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } }),
      fetch(overviewUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } }),
    ]);

    const forecastData = await forecastRes.json();
    const overviewData = await overviewRes.json();

    // 2. 解析氣象廳 JSON 結構
    const timeSeries = forecastData[0].timeSeries;
    const weekSeries = forecastData[1]?.timeSeries;

    // 今日・明日・後天天氣
    const weatherSeries = timeSeries[0];
    const popSeries    = timeSeries[1]; // 降水機率
    const tempSeries   = timeSeries[2]; // 氣溫

    // 找到上川地方的區域索引
    const areaIdx = weatherSeries.areas.findIndex(a =>
      a.area.name.includes('上川') || a.area.name.includes('旭川') || a.area.name.includes('宗谷')
    ) || 0;

    const todayCode     = parseInt(weatherSeries.areas[areaIdx]?.weatherCodes?.[0] || '100');
    const tomorrowCode  = parseInt(weatherSeries.areas[areaIdx]?.weatherCodes?.[1] || '100');
    const todayWeather  = weatherSeries.areas[areaIdx]?.weathers?.[0] || '';

    const todayInfo    = getWeatherInfo(todayCode);
    const tomorrowInfo = getWeatherInfo(tomorrowCode);

    // 氣溫
    let tempMin = null, tempMax = null;
    if (tempSeries?.areas?.length > 0) {
  const temps = tempSeries.areas[0];
  const minTemps = (temps.tempsMin || temps.temps || []).filter(t => t !== '');
  const maxTemps = (temps.tempsMax || temps.temps || []).filter(t => t !== '');
  tempMin = minTemps.length > 0 ? parseFloat(minTemps[0]) : null;
  tempMax = maxTemps.length > 0 ? parseFloat(maxTemps[0]) : null;
}

    // 降水機率
    let popValues = [];
    if (popSeries?.areas?.length > 0) {
      popValues = popSeries.areas[0]?.pops?.map(p => p === '' ? '--' : `${p}%`) || [];
    }

    // 3. 計算安全指數
    const safety = calcSafetyIndex(todayInfo.level, tempMin);

    // 4. 週間天氣
    let weeklyForecast = [];
    if (weekSeries?.length > 0) {
      const wkWeather = weekSeries[0];
      const wkTemp    = weekSeries[1];
      const days = ['今天', '明天', '後天', '4天後', '5天後', '6天後', '7天後'];

      wkWeather?.timeDefines?.slice(0, 7).forEach((dt, i) => {
        const code = parseInt(wkWeather.areas?.[0]?.weatherCodes?.[i] || '100');
        const info = getWeatherInfo(code);
        const date = new Date(dt);
        const weekDay = ['日', '一', '二', '三', '四', '五', '六'][date.getDay()];

        weeklyForecast.push({
          label: i < 3 ? days[i] : `週${weekDay}`,
          emoji: info.emoji,
          weather: info.label,
          tempMax: wkTemp?.areas?.[0]?.tempsMax?.[i] || '--',
          tempMin: wkTemp?.areas?.[0]?.tempsMin?.[i] || '--',
          pop: wkWeather.areas?.[0]?.pops?.[i] || '--',
          level: info.level,
        });
      });
    }

    // 5. 警報生成（根據天氣狀況）
    const alerts = [];
    if (todayInfo.level === 'blizzard') {
      alerts.push({ type: 'danger', icon: '🚨', title: '暴風雪特報', desc: '能見度極低，強烈建議不要外出。如需移動請聯繫旅館確認道路狀況。' });
    } else if (todayInfo.level === 'heavy_snow') {
      alerts.push({ type: 'danger', icon: '⚠️', title: '大雪特報發佈中', desc: '部分道路可能封閉，自駕需安裝雪胎。建議優先使用大眾運輸。' });
    }
    if (safety.iceRisk > 60) {
      alerts.push({ type: 'warn', icon: '🧊', title: '黑冰高風險時段', desc: '清晨 05:00–09:00 橋面與交叉路口結冰風險極高，行車務必減速至 30km/h 以下。' });
    }
    if (todayInfo.level === 'snow' || todayInfo.level === 'heavy_snow') {
      alerts.push({ type: 'info', icon: '👟', title: '防滑提醒', desc: '積雪路面行走請穿防滑靴，避免走人行道邊緣。旭川車站前廣場可能有結冰。' });
    }

    // 6. 概況文字（日文概況翻譯提示）
    const overviewText = overviewData?.text || '';

    // 7. 組裝回傳資料
    const result = {
      location: areaInfo.name,
      updatedAt: new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Tokyo' }),
      today: {
        emoji: todayInfo.emoji,
        label: todayInfo.label,
        level: todayInfo.level,
        tempMin,
        tempMax,
        feelsLike: tempMin !== null ? tempMin - 4 : null,
        pop: popValues.slice(0, 4),
        rawJa: todayWeather.replace(/\s+/g, ' ').trim(),
      },
      tomorrow: {
        emoji: tomorrowInfo.emoji,
        label: tomorrowInfo.label,
        level: tomorrowInfo.level,
      },
      safety: {
        iceRisk:    safety.iceRisk,
        visibility: safety.visibility,
        roadOpen:   safety.roadOpen,
        driveScore: safety.driveScore,
        driveLabel: safety.driveScore >= 80 ? '適合自駕'
          : safety.driveScore >= 50 ? '謹慎駕駛'
          : safety.driveScore >= 30 ? '建議大眾運輸'
          : '⛔ 不建議出門',
      },
      alerts,
      weekly: weeklyForecast,
      overview: overviewText,
    };

    res.json(result);

  } catch (err) {
    console.error('JMA API Error:', err.message);
    res.status(500).json({
      error: '無法取得氣象廳資料',
      detail: err.message,
    });
  }
});

// 健康檢查（Railway 用）
app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.listen(PORT, () => {
  console.log(`✅ 道北天氣伺服器啟動 http://localhost:${PORT}`);
});
