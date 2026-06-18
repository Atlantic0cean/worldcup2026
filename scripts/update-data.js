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

  const json = await get(
    'https://api.football-data.org/v4/competitions/WC/matches',
    { 'X-Auth-Token': TOKEN }
  );

  const matches = (json.matches || [])
    .filter(m => m.stage === 'GROUP_STAGE' && m.homeTeam?.name)
    .map(m => ({
      id:     m.id,
      group:  (m.group || '').replace('GROUP_', ''),
      home:   toRu(m.homeTeam.name),
      away:   toRu(m.awayTeam.name),
      date:   m.utcDate,
      hs:     m.score?.fullTime?.home  ?? null,
      as:     m.score?.fullTime?.away  ?? null,
      status: m.status === 'FINISHED'  ? 'FT'
            : ['IN_PLAY', 'PAUSED'].includes(m.status) ? 'LIVE'
            : 'UPCOMING',
      venue:  m.venue || '',
    }));

  const live     = matches.filter(m => m.status === 'LIVE').length;
  const finished = matches.filter(m => m.status === 'FT').length;
  const upcoming = matches.filter(m => m.status === 'UPCOMING').length;
  console.log(`  ${matches.length} matches: ${live} LIVE, ${finished} FT, ${upcoming} upcoming`);

  const out = {
    updatedAt: new Date().toISOString(),
    matches,
  };

  const outPath = path.join(__dirname, '..', 'data.json');
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2), 'utf8');
  console.log(`Saved → data.json (${matches.length} matches)`);
}

main().catch(err => { console.error('ERROR:', err.message); process.exit(1); });
