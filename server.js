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

  // 台灣人體感穿著建議（以台灣人不耐冷為基準）
  let outfit = '';
  if (temp <= -10) {
    outfit = '🧥 極寒｜羽絨外套＋毛帽＋手套＋厚襪，台灣人在這溫度體感極不適應，全副武裝出門';
  } else if (temp <= -5) {
    outfit = '🧥 嚴寒｜羽絨外套必備，加毛帽與手套，建議穿保暖內搭褲，不要只穿牛仔褲出門';
  } else if (temp <= 0) {
    outfit = '🧣 很冷｜厚外套＋圍巾，體感比台灣的「冬天」冷非常多，建議多穿一層';
  } else if (temp <= 5) {
    outfit = '🧣 冷｜中厚外套＋圍巾，台灣人通常在這溫度會覺得很冷，別輕敵';
  } else if (temp <= 10) {
    outfit = '🧤 涼冷｜薄外套＋長袖打底，早晚溫差大，建議帶一件可以脫的外層';
  } else if (temp <= 15) {
    outfit = '👕 微涼｜薄外套或長袖即可，白天走動不會太冷，但早晚還是帶件外套';
  } else if (temp <= 20) {
    outfit = '👕 舒適｜長袖或薄外套，北海道夏天氣候宜人，這溫度台灣人會覺得剛剛好';
  } else {
    outfit = '☀️ 溫暖｜短袖可行，但北海道日夜溫差仍大，傍晚建議備一件薄外套';
  }

  // 補充風速修正
  if (feelsLike <= temp - 5) {
    outfit += `（風大，體感比實際氣溫低 ${temp - feelsLike}°C，要多加一層）`;
  }

  return { tips, summary: outfit, activityOk, driveOk };
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
      `&hourly=temperature_2m,snowfall,precipitation,precipitation_probability&timezone=Asia%2FTokyo&forecast_days=2`;

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

    // 未來 6 小時降雪趨勢（跨日處理）
    const now = new Date();
    const nowHour = parseInt(now.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', hour: 'numeric', hour12: false }));

    // Open-Meteo 回傳的 hourly 是當天 0-23 時，需要抓 2 天資料才能跨日
    const hourlyAll = hourly;
    function getTrend(arr, transform) {
      if (!arr) return [];
      const result = [];
      for (let i = 0; i < 6; i++) {
        const idx = nowHour + i;
        const val = arr[idx] ?? null;
        if (val === null) break;
        const displayHour = (nowHour + i) % 24;
        result.push({ hour: `${displayHour}時`, ...transform(val) });
      }
      return result;
    }

    const snowTrend = getTrend(hourlyAll.snowfall, v => ({ snow: v }));
    const rainTrend = getTrend(hourlyAll.precipitation, v => ({ rain: Math.round(v * 10) / 10 }));
    const popTrend  = getTrend(hourlyAll.precipitation_probability, v => ({ pop: v }));

    const advice = generateAdvice(cityKey, weather);

    // 根據天氣從資料庫動態推薦景點
    const now2 = new Date();
    const month = now2.getMonth() + 1;
    const isWinter = month >= 11 || month <= 3;

    const recommendedSpots = recommendSpots(weather.level, {
      city: cityKey,
      winter: isWinter,
      limit: 20,
    });

    res.json({
      city: city.name,
      spots: recommendedSpots,
      updatedAt: new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Tokyo' }),
      weather,
      advice,
      snowTrend,
      rainTrend,
      popTrend,
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

// ================================================
// 16天預報 API
// ================================================
app.get('/api/forecast', async (req, res) => {
  const cityKey = req.query.city || 'asahikawa';
  const city = CITIES[cityKey] || CITIES.asahikawa;

  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${city.lat}&longitude=${city.lon}` +
      `&daily=weathercode,temperature_2m_max,temperature_2m_min,precipitation_sum,snowfall_sum,precipitation_probability_max,windspeed_10m_max` +
      `&timezone=Asia%2FTokyo&forecast_days=16`;

    const res2 = await fetch(url);
    const data = await res2.json();

    const days = data.daily.time.map((date, i) => {
      const wmo = getWMO(data.daily.weathercode[i]);
      const d = new Date(date);
      const weekDay = ['日', '一', '二', '三', '四', '五', '六'][d.getDay()];
      const mmdd = `${d.getMonth() + 1}/${d.getDate()}`;

      return {
        date,
        label: i === 0 ? '今天' : i === 1 ? '明天' : `${mmdd}（週${weekDay}）`,
        emoji: wmo.emoji,
        weather: wmo.label,
        level: wmo.level,
        tempMax: Math.round(data.daily.temperature_2m_max[i]),
        tempMin: Math.round(data.daily.temperature_2m_min[i]),
        snow: Math.round(data.daily.snowfall_sum[i] * 10) / 10,
        rain: Math.round(data.daily.precipitation_sum[i] * 10) / 10,
        pop: data.daily.precipitation_probability_max[i],
        wind: Math.round(data.daily.windspeed_10m_max[i]),
      };
    });

    res.json({ city: city.name, days });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ================================================
// 歷史氣候 API（過去5年同月平均）
// ================================================
app.get('/api/climate', async (req, res) => {
  const cityKey = req.query.city || 'asahikawa';
  const city = CITIES[cityKey] || CITIES.asahikawa;

  try {
    const currentYear = new Date().getFullYear();
    const startYear = currentYear - 5;

    const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${city.lat}&longitude=${city.lon}` +
      `&start_date=${startYear}-01-01&end_date=${currentYear - 1}-12-31` +
      `&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,snowfall_sum` +
      `&timezone=Asia%2FTokyo`;

    const res2 = await fetch(url);
    const data = await res2.json();

    // 按月份統計
    const monthStats = Array.from({ length: 12 }, (_, m) => ({
      month: m + 1,
      label: `${m + 1}月`,
      tempMax: [], tempMin: [], snow: [], rain: [],
    }));

    data.daily.time.forEach((date, i) => {
      const m = new Date(date).getMonth();
      if (data.daily.temperature_2m_max[i] !== null)
        monthStats[m].tempMax.push(data.daily.temperature_2m_max[i]);
      if (data.daily.temperature_2m_min[i] !== null)
        monthStats[m].tempMin.push(data.daily.temperature_2m_min[i]);
      if (data.daily.snowfall_sum[i] !== null)
        monthStats[m].snow.push(data.daily.snowfall_sum[i]);
      if (data.daily.precipitation_sum[i] !== null)
        monthStats[m].rain.push(data.daily.precipitation_sum[i]);
    });

    const avg = arr => arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length * 10) / 10 : null;
    const snowDays = arr => arr.filter(v => v > 0).length;

    const result = monthStats.map(m => ({
      month: m.month,
      label: m.label,
      avgTempMax: avg(m.tempMax),
      avgTempMin: avg(m.tempMin),
      avgSnow: avg(m.snow),
      avgRain: avg(m.rain),
      snowDaysPerMonth: Math.round(snowDays(m.snow) / 5),
      recommend: getMonthRecommend(m.month),
    }));

    res.json({ city: city.name, months: result, basedOnYears: 5 });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function getMonthRecommend(month) {
  const map = {
    1:  { label: '冬季雪景', icon: '❄️', note: '最冷月份，旭川冰雪節，適合賞雪' },
    2:  { label: '冰雪祭典', icon: '🎪', note: '旭川冬まつり，企鵝散步限定' },
    3:  { label: '春雪交替', icon: '🌨️', note: '開始融雪，道路泥濘，非最佳季節' },
    4:  { label: '春季初始', icon: '🌸', note: '氣溫回升，部分景點開始營業' },
    5:  { label: '春暖花開', icon: '🌼', note: '氣候舒適，適合自駕，人潮少' },
    6:  { label: '初夏清爽', icon: '🌿', note: '台灣人最喜歡的氣候，涼爽宜人' },
    7:  { label: '薰衣草季', icon: '💜', note: '富良野薰衣草盛開，旺季人潮多' },
    8:  { label: '夏日全盛', icon: '🌻', note: '花田全開，氣溫適中，旺季高峰' },
    9:  { label: '秋色初現', icon: '🍂', note: '氣溫下降，紅葉開始，人潮減少' },
    10: { label: '紅葉旺季', icon: '🍁', note: '大雪山紅葉絕景，攝影首選季節' },
    11: { label: '初雪時分', icon: '🌨️', note: '開始降雪，路面轉滑，準備換季' },
    12: { label: '白色冬日', icon: '⛄', note: '積雪穩定，聖誕氛圍，溫泉最享受' },
  };
  return map[month] || { label: '', icon: '📅', note: '' };
}

// 根據氣溫產生穿著建議（台灣人體感）
function getOutfitAdvice(avgTempMax, avgTempMin, month) {
  const mid = (avgTempMax + avgTempMin) / 2;
  const isWinter = month >= 11 || month <= 3;
  const hasSnow = month >= 11 || month <= 4;

  let layers = [];
  let items = [];
  let warning = '';

  // 上半身
  if (mid <= -10) {
    layers = ['極暖羽絨外套（800fill以上）', '中層刷毛或羊毛衣', '保暖內搭（台灣人必穿）'];
    warning = '⚠️ 台灣人在此溫度體感極差，一定要全副武裝';
  } else if (mid <= -5) {
    layers = ['厚羽絨外套', '毛衣或刷毛中層', '保暖長袖內搭'];
    warning = '⚠️ 此溫度對台灣人非常冷，請勿輕敵';
  } else if (mid <= 0) {
    layers = ['羽絨或厚棉外套', '薄毛衣', '長袖內搭'];
    warning = '💡 體感比台灣「冷颼颼的冬天」還要再冷一倍';
  } else if (mid <= 5) {
    layers = ['中厚外套', '長袖上衣'];
    warning = '💡 台灣人通常覺得這溫度「很冷」，別少穿';
  } else if (mid <= 10) {
    layers = ['薄外套或風衣', '長袖上衣'];
    warning = '💡 早晚溫差大，外套可以脫的款式最方便';
  } else if (mid <= 15) {
    layers = ['薄外套（傍晚必備）', '長袖或短袖'];
  } else if (mid <= 20) {
    layers = ['長袖為主', '薄外套備用'];
  } else {
    layers = ['短袖為主', '薄外套傍晚備用'];
  }

  // 下半身
  if (mid <= 0) {
    items.push('保暖褲或厚牛仔褲（不建議只穿薄牛仔褲）');
  } else if (mid <= 10) {
    items.push('長褲即可，薄牛仔褲OK');
  } else {
    items.push('長褲或薄長褲均可');
  }

  // 鞋子
  if (hasSnow && mid <= 5) {
    items.push('防滑雪靴（平底、防水，旭川市區必備）');
  } else if (mid <= 10) {
    items.push('包覆性好的運動鞋或輕便靴');
  } else {
    items.push('一般球鞋或輕便鞋即可');
  }

  // 配件
  if (mid <= 0) {
    items.push('毛帽＋手套＋圍巾（三件套缺一不可）');
  } else if (mid <= 8) {
    items.push('薄圍巾或脖套建議攜帶');
  }

  // 雨傘
  if (!isWinter) {
    items.push('折疊傘備用（北海道夏季午後偶有陣雨）');
  }

  const rec = getMonthRecommend(month);

  return {
    month,
    icon: rec.icon,
    label: rec.label,
    avgTempMax: Math.round(avgTempMax),
    avgTempMin: Math.round(avgTempMin),
    layers,
    items,
    warning,
    seasonNote: rec.note,
  };
}

// ================================================
// 穿著建議 API（指定日期）
// ================================================
app.get('/api/outfit', async (req, res) => {
  const cityKey = req.query.city || 'asahikawa';
  const city = CITIES[cityKey] || CITIES.asahikawa;
  const dateStr = req.query.date; // 格式：YYYY-MM-DD

  if (!dateStr) {
    return res.status(400).json({ error: '請提供 date 參數（YYYY-MM-DD）' });
  }

  const targetDate = new Date(dateStr);
  const month = targetDate.getMonth() + 1;
  const targetYear = targetDate.getFullYear();
  const currentYear = new Date().getFullYear();

  try {
    let avgTempMax, avgTempMin;

    // 如果是未來或當年 → 用歷史同月份資料
    // 如果是過去 → 直接抓當天實際資料
    const isPast = targetYear < currentYear;

    if (isPast) {
      const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${city.lat}&longitude=${city.lon}` +
        `&start_date=${dateStr}&end_date=${dateStr}` +
        `&daily=temperature_2m_max,temperature_2m_min` +
        `&timezone=Asia%2FTokyo`;
      const r = await fetch(url);
      const data = await r.json();
      avgTempMax = data.daily.temperature_2m_max[0];
      avgTempMin = data.daily.temperature_2m_min[0];
    } else {
      // 抓過去5年同月份平均
      const mmdd = dateStr.slice(5);
      const years = [1, 2, 3, 4, 5].map(i => currentYear - i);
      const temps = await Promise.all(years.map(async y => {
        const d = `${y}-${mmdd}`;
        const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${city.lat}&longitude=${city.lon}` +
          `&start_date=${d}&end_date=${d}` +
          `&daily=temperature_2m_max,temperature_2m_min&timezone=Asia%2FTokyo`;
        const r = await fetch(url);
        const data = await r.json();
        return {
          max: data.daily?.temperature_2m_max?.[0],
          min: data.daily?.temperature_2m_min?.[0],
        };
      }));
      const valid = temps.filter(t => t.max !== null && t.min !== null);
      avgTempMax = valid.reduce((s, t) => s + t.max, 0) / valid.length;
      avgTempMin = valid.reduce((s, t) => s + t.min, 0) / valid.length;
    }

    const outfit = getOutfitAdvice(avgTempMax, avgTempMin, month);
    res.json({
      city: city.name,
      date: dateStr,
      isPast,
      outfit,
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
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
