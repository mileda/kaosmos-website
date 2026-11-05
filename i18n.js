// EN text lives in the HTML; TR text lives here. Pick: ?lang= → saved choice → browser language.
const TR = {
  nav1: 'Yayınlar', nav2: 'Canlı', nav3: 'Hakkında', nav4: 'İletişim',
  cue: 'boşluğa gir',
  manLabel: '// sinyal',
  manText: 'Gizemli atmosferik temalar ve sentezleyicilerin uğuldayan soğuk katmanları — dinleyicisini bu gezegende yaşadığımız gerçeklikten özgürleştirmeyi amaçlayan bir müzik.',
  portal: 'kozmosa doğru',
  latestLabel: '// yeni albüm · 5 kasım 2026', latestLine: '<em>çözülüşten oluşa.</em>', length: 'Süre',
  tracks: 'Parça', tags: 'Etiketler', tagsVal: 'ambient · drone · deneysel',
  listen: "Bandcamp’te dinle ve satın al →",
  discoLabel: '// diskografi 2013 — 2026',
  discoTitle: '<span class="t-outline">On dört</span> <em>sinyal</em>.',
  elseLabel: '// başka yerlerde',
  elseTitle: '<span class="t-outline">Başka</span> frekanslardan<br><span class="t-indent"><em>sinyaller</em>.</span>',
  elseText: 'Konuk olduğu parçalar, remiksler ve başka plak şirketlerinden yayınlar.',
  mixtapes: 'Mixtape’ler →',
  liveLabel: '// canlı',
  liveTitle: '<span class="t-outline">Karanlıkta</span>,<br><span class="t-indent">ses ve <em>ışık</em>.</span>',
  liveText: 'Modüler synth’ler, drone’lar, projeksiyonlar. Canlı çalınır.',
  aboutLabel: '// hakkında',
  aboutTitle: "<em>İstanbul’dan</em><br><span class=\"t-indent\">bir solo proje.</span>",
  about1: "KAOSMOS, 2013’te başlayan, İstanbul çıkışlı solo ambient, drone ve deneysel müzik projesi. Gizemli atmosferik temaları sentezleyicilerin uğuldayan soğuk katmanlarıyla harmanlayarak KAOSMOS’a hayat veriyor.",
  about2: 'Müziğiyle dinleyicilerini bu gezegende yaşadığımız gerçeklikten özgürleştirmeyi amaçlıyor — en azından bir albüm boyunca.',
  contactLabel: '// iletişim',
  contactText: 'Konser, iş birliği ve yayın talepleri için.',
  foot: 'KAOSMOS · İstanbul',
  gateLabel: '// sinyal geliyor', gateOn: 'Sesle gir', gateOff: 'Sessiz gir', gateNote: 'kulaklıkla dinlemeniz önerilir',
  sound: 'ses', menuOpen: 'menü',
  atticLabel: '// çatı katı', atticTone: '// ses rengi',
};
const TR_TYPES = { new: 'yeni', compilation: 'derleme', single: 'tekli', split: 'ortak albüm', debut: 'ilk albüm', tracks: 'parça' };

const EN = {};
document.querySelectorAll('[data-i18n]').forEach(el => { EN[el.dataset.i18n] = el.innerHTML; });
document.querySelectorAll('.card__type').forEach(el => { el.dataset.en = el.textContent; });

function setLang(lang) {
  const dict = lang === 'tr' ? TR : EN;
  document.querySelectorAll('[data-i18n]').forEach(el => { el.innerHTML = dict[el.dataset.i18n] ?? EN[el.dataset.i18n]; });
  document.querySelectorAll('[data-tr]').forEach(el => { el.dataset.en ??= el.textContent; el.textContent = lang === 'tr' ? el.dataset.tr : el.dataset.en; });
  document.querySelectorAll('.card__type').forEach(el => {
    el.textContent = lang === 'tr' ? el.dataset.en.replace(/[a-z]+/g, w => TR_TYPES[w] ?? w) : el.dataset.en;
  });
  document.documentElement.lang = lang;
  document.querySelectorAll('.lang [data-l]').forEach(s => s.classList.toggle('on', s.dataset.l === lang));
  try { localStorage.setItem('lang', lang); } catch {}
  document.dispatchEvent(new CustomEvent('langchange'));
}

// Turkish is switched off for now (the translations above stay). Set TR_ENABLED = true to bring the EN / TR toggle back.
const TR_ENABLED = false;
let saved = null; try { saved = localStorage.getItem('lang'); } catch {}
const initial = TR_ENABLED ? (new URLSearchParams(location.search).get('lang') || saved || (navigator.language.startsWith('tr') ? 'tr' : 'en')) : 'en';
setLang(initial === 'tr' ? 'tr' : 'en');
if (!TR_ENABLED) document.querySelector('.lang').hidden = true;
document.querySelector('.lang').addEventListener('click', () => {
  setLang(document.documentElement.lang === 'tr' ? 'en' : 'tr');
  window.track?.('language', { lang: document.documentElement.lang });
});
