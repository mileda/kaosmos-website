// EN text lives in the HTML; TR text lives here. Pick: ?lang= → saved choice → browser language.
const TR = {
  nav1: 'Yayınlar', nav2: 'Canlı', nav3: 'Hakkında', nav4: 'İletişim',
  cue: 'boşluğa gir',
  manLabel: '// sinyal',
  manText: 'Gizemli atmosferik temalar ve sentezleyicilerin uğuldayan soğuk katmanları — dinleyicisini bu gezegende yaşadığımız gerçeklikten özgürleştirmeyi amaçlayan bir müzik.',
  portal: 'kozmosa doğru',
  latestLabel: '// son yayın · şubat 2023',
  tracks: 'Parça', tags: 'Etiketler', tagsVal: 'ambient · drone · deneysel',
  listen: "Bandcamp'te dinle ve satın al →",
  discoLabel: '// diskografi 2013 — 2023',
  discoTitle: 'On üç sinyal.',
  liveLabel: '// canlı',
  liveTitle: 'Karanlıkta,<br>ses ve ışık.',
  liveText: 'Modüler synth’ler, drone’lar, projeksiyonlar. O oda için, canlı kurulur.',
  aboutLabel: '// hakkında',
  aboutTitle: "İstanbul'dan bir solo proje.",
  about1: "KAOSMOS, 2013'te başlayan, İstanbul çıkışlı solo ambient, drone ve deneysel müzik projesi. Gizemli atmosferik temaları sentezleyicilerin uğuldayan soğuk katmanlarıyla harmanlayarak KAOSMOS'a hayat veriyor.",
  about2: 'Müziğiyle dinleyicilerini bu gezegende yaşadığımız gerçeklikten özgürleştirmeyi amaçlıyor — en azından bir albüm boyunca.',
  contactLabel: '// iletişim',
  contactText: 'Konser, iş birliği ve yayın talepleri için.',
  foot: 'KAOSMOS · İstanbul',
  gateLabel: '// sinyal geliyor', gateOn: 'Sesle gir', gateOff: 'Sessiz gir', gateNote: 'kulaklıkla dinlemeniz önerilir',
  sound: 'ses',
  atticLabel: '// çatı katı', atticTone: '// ses rengi',
};
const TR_TYPES = { compilation: 'derleme', single: 'tekli', split: 'ortak albüm', debut: 'ilk albüm', tracks: 'parça' };

const EN = {};
document.querySelectorAll('[data-i18n]').forEach(el => { EN[el.dataset.i18n] = el.innerHTML; });
document.querySelectorAll('.card__type').forEach(el => { el.dataset.en = el.textContent; });

function setLang(lang) {
  const dict = lang === 'tr' ? TR : EN;
  document.querySelectorAll('[data-i18n]').forEach(el => { el.innerHTML = dict[el.dataset.i18n] ?? EN[el.dataset.i18n]; });
  document.querySelectorAll('.card__type').forEach(el => {
    el.textContent = lang === 'tr' ? el.dataset.en.replace(/[a-z]+/g, w => TR_TYPES[w] ?? w) : el.dataset.en;
  });
  document.documentElement.lang = lang;
  document.querySelectorAll('.lang [data-l]').forEach(s => s.classList.toggle('on', s.dataset.l === lang));
  try { localStorage.setItem('lang', lang); } catch {}
  document.dispatchEvent(new CustomEvent('langchange'));
}

let saved = null; try { saved = localStorage.getItem('lang'); } catch {}
const initial = new URLSearchParams(location.search).get('lang') || saved || (navigator.language.startsWith('tr') ? 'tr' : 'en');
setLang(initial === 'tr' ? 'tr' : 'en');
document.querySelector('.lang').addEventListener('click', () => {
  setLang(document.documentElement.lang === 'tr' ? 'en' : 'tr');
  window.track?.('language', { lang: document.documentElement.lang });
});
