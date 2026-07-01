#!/usr/bin/env node
'use strict';

const https = require('https');
const fs    = require('fs');
const path  = require('path');

const TOKEN = process.env.FOOTBALL_DATA_TOKEN;
if (!TOKEN) { console.error('FOOTBALL_DATA_TOKEN not set'); process.exit(1); }

// Same mapping as in the browser app
const TEAM_EN_TO_RU = {
  'Mexico':'Мексика','South Africa':'ЮАР','South Korea':'Южная Корея',
  'Korea Republic':'Южная Корея','Czechia':'Чехия','Czech Republic':'Чехия',
  'Canada':'Канада','Bosnia-Herzegovina':'Босния','Qatar':'Катар',
  'Switzerland':'Швейцария','United States':'США','Paraguay':'Парагвай',
  'Australia':'Австралия','Turkey':'Турция','Türkiye':'Турция',
  'Brazil':'Бразилия','Morocco':'Марокко','Haiti':'Гаити','Scotland':'Шотландия',
  'Germany':'Германия','Curaçao':'Кюрасао','Ivory Coast':'Кот-д\'Ивуар',
  "Côte d'Ivoire":'Кот-д\'Ивуар','Ecuador':'Эквадор','Netherlands':'Нидерланды',
  'Japan':'Япония','Sweden':'Швеция','Tunisia':'Тунис','Belgium':'Бельгия',
  'Egypt':'Египет','Iran':'Иран','New Zealand':'Новая Зеландия',
  'Spain':'Испания','Cape Verde Islands':'Кабо-Верде','Cape Verde':'Кабо-Верде',
  'Saudi Arabia':'Саудовская Аравия','Uruguay':'Уругвай','France':'Франция',
  'Senegal':'Сенегал','Iraq':'Ирак','Norway':'Норвегия','Argentina':'Аргентина',
  'Algeria':'Алжир','Austria':'Австрия','Jordan':'Иордания','Colombia':'Колумбия',
  'Portugal':'Португалия','Congo DR':'Конго','DR Congo':'Конго',
  'England':'Англия','Croatia':'Хорватия','Ghana':'Гана','Panama':'Панама',
  'Uzbekistan':'Узбекистан',
};
function toRu(name) { return TEAM_EN_TO_RU[name] || name; }

function get(url, headers) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, { headers }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8');
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}: ${body.slice(0, 200)}`));
          return;
        }
        try { resolve(JSON.parse(body)); }
        catch (e) { reject(new Error('JSON parse error: ' + e.message)); }
      });
    });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(new Error('timeout')); });
    req.end();
  });
}

async function main() {
  console.log('Fetching WC 2026 data…');

  // Preserve existing highlightsUrl values so they survive re-fetches
  const outPath = path.join(__dirname, '..', 'data.json');
  const existingHighlights = {};
  try {
    const existing = JSON.parse(fs.readFileSync(outPath, 'utf8'));
    for (const m of (existing.matches || [])) {
      if (m.highlightsUrl) existingHighlights[m.id] = m.highlightsUrl;
    }
  } catch (_) {}

  const json = await get(
    'https://api.football-data.org/v4/competitions/WC/matches',
    { 'X-Auth-Token': TOKEN }
  );

  // football-data.org stage codes → short internal stage ids
  const STAGE_MAP = {
    GROUP_STAGE:    'GROUP',
    LAST_32:        'R32',
    ROUND_OF_32:    'R32',
    LAST_16:        'R16',
    ROUND_OF_16:    'R16',
    QUARTER_FINALS: 'QF',
    SEMI_FINALS:    'SF',
    THIRD_PLACE:    '3RD',
    FINAL:          'FINAL',
  };

  const matches = (json.matches || [])
    .filter(m => STAGE_MAP[m.stage])
    .map(m => {
      const status = m.status === 'FINISHED'       ? 'FT'
                   : ['IN_PLAY', 'PAUSED'].includes(m.status) ? 'LIVE'
                   : 'UPCOMING';
      const entry = {
        id:     m.id,
        stage:  STAGE_MAP[m.stage],
        group:  (m.group || '').replace('GROUP_', ''),
        home:   m.homeTeam?.name ? toRu(m.homeTeam.name) : null,
        away:   m.awayTeam?.name ? toRu(m.awayTeam.name) : null,
        date:   m.utcDate,
        hs:     m.score?.fullTime?.home ?? null,
        as:     m.score?.fullTime?.away ?? null,
        status,
        venue:  m.venue || '',
      };
      // Плей-офф: серия пенальти после ничьей (только у knockout-стадий)
      if (m.score?.duration === 'PENALTY_SHOOTOUT' && m.score?.penalties) {
        entry.pHs = m.score.penalties.home ?? null;
        entry.pAs = m.score.penalties.away ?? null;
      }
      const hl = m.highlightsUrl || existingHighlights[m.id];
      if (hl) entry.highlightsUrl = hl;
      return entry;
    });

  const live     = matches.filter(m => m.status === 'LIVE').length;
  const finished = matches.filter(m => m.status === 'FT').length;
  const upcoming = matches.filter(m => m.status === 'UPCOMING').length;
  const playoff  = matches.filter(m => m.stage !== 'GROUP').length;
  console.log(`  ${matches.length} matches: ${live} LIVE, ${finished} FT, ${upcoming} upcoming (${playoff} playoff)`);

  const out = {
    updatedAt: new Date().toISOString(),
    matches,
  };

  fs.writeFileSync(outPath, JSON.stringify(out, null, 2), 'utf8');
  console.log(`Saved → data.json (${matches.length} matches)`);
}

main().catch(err => { console.error('ERROR:', err.message); process.exit(1); });
