// Star Stories — house-style illustration engine (Tier 2–3, vector).
// The generator tags each chapter with <figure class="art" data-motif="KEY"
// data-scene="…"></figure>. In vector mode this fills each figure with a
// composed SVG scene keyed by motif and tinted to the child's element accent.
// Deterministic, print-sharp, ~free per book. Painted mode (see reader.js +
// /api/illustrate) swaps these for rendered art when opted in.

const ART = (() => {
  let uid = 0;
  const NIGHT = ['sky', 'cosmos', 'moon', 'star', 'egg', 'crown'];   // dark grounds
  const ACCENTS = { Fire: '#c9772b', Earth: '#7a8c4a', Air: '#6f9bb5', Water: '#1a9eae' };

  const g = n => `ss${n}_${uid}`; // unique gradient id per render

  function stars(list) {
    return list.map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="#f4eecf"/>`).join('');
  }
  function goldStar(x, y, s = 1) {
    const p = (a, b) => `${x + a * s},${y + b * s}`;
    return `<path fill="#c9a227" d="M${p(0,-9)} C${p(2,-2)} ${p(4,0)} ${p(11,1)} C${p(4,2)} ${p(2,4)} ${p(0,11)} C${p(-2,4)} ${p(-4,2)} ${p(-11,1)} C${p(-4,0)} ${p(-2,-2)} ${p(0,-9)} Z"/>`;
  }
  function waves(id, accent, top) {
    return `<path fill="url(#${id})" opacity="0.85" d="M-10 ${top} Q40 ${top-10} 90 ${top} T190 ${top} T310 ${top} V190 H-10 Z"/>
      <path fill="#eaf7f9" opacity="0.55" d="M-10 ${top+14} Q40 ${top+5} 90 ${top+14} T190 ${top+14} T310 ${top+14} V190 H-10 Z"/>`;
  }

  // ── motif builders (each returns inner SVG for a 288×176 viewBox) ──
  const M = {
    sea(a) {
      const s = g('sea'), n = uid;
      return `<defs><linearGradient id="${s}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="#0c5a66"/></linearGradient></defs>
        <rect width="288" height="176" rx="10" fill="#eef5f6"/>
        ${stars([[40,26,1],[224,30,1.1],[120,20,0.9]])}
        ${waves(s, a, 96)}
        <path fill="none" stroke="#fff" stroke-width="1.4" opacity="0.5" d="M40 120 q26 -10 52 0 t104 0"/>
        ${goldStar(210, 60, 1.1)}${goldStar(64, 74, 0.7)}`;
    },
    'mountain-sea'(a) {
      const s = g('ms');
      return `<defs><linearGradient id="${s}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="#0c5a66"/></linearGradient></defs>
        <rect width="288" height="176" rx="10" fill="#eef5f6"/>
        <path fill="#f2ece0" stroke="#2c2416" stroke-width="2.2" d="M44 150 L144 40 L244 150 Z"/>
        <clipPath id="${s}c"><path d="M44 150 L144 40 L244 150 Z"/></clipPath>
        <g clip-path="url(#${s}c)">${waves(s, a, 110)}${goldStar(144, 96, 1)}</g>
        ${goldStar(76, 40, 0.7)}${goldStar(214, 52, 0.8)}`;
    },
    mountain(a) {
      return `<rect width="288" height="176" rx="10" fill="#f0ece1"/>
        ${stars([[60,30,1],[230,26,1]])}
        <path fill="#cdbfa0" d="M-10 150 L70 70 L150 150 Z"/>
        <path fill="#b7a680" stroke="#2c2416" stroke-width="2" d="M96 150 L188 44 L286 150 Z"/>
        <path fill="#f7f1e3" d="M188 44 L172 66 L204 66 Z"/>
        ${goldStar(210, 34, 0.9)}`;
    },
    fog(a) {
      return `<rect width="288" height="176" rx="10" fill="#eceae6"/>
        ${[[24,44,220,0.85],[52,72,168,0.6],[34,100,196,0.45],[60,128,150,0.3]]
          .map(([x,y,w,o]) => `<rect x="${x}" y="${y}" width="${w}" height="14" rx="7" fill="#b9c2c6" opacity="${o}"/>`).join('')}
        ${goldStar(70, 118, 0.7)}${goldStar(210, 60, 0.6)}`;
    },
    sword(a) {
      return `<rect width="288" height="176" rx="10" fill="#eceae6"/>
        ${[[30,52,224,0.8],[54,82,168,0.5],[40,112,196,0.3]]
          .map(([x,y,w,o]) => `<rect x="${x}" y="${y}" width="${w}" height="13" rx="6" fill="#b9c2c6" opacity="${o}"/>`).join('')}
        <g stroke="#2c2416" stroke-width="3" stroke-linecap="round"><path d="M84 140 L196 34"/><path d="M96 118 L120 138"/></g>
        ${goldStar(214, 118, 0.7)}`;
    },
    sun(a) {
      const r = g('sun');
      let rays = '';
      for (let i = 0; i < 12; i++) { const t = i / 12 * Math.PI * 2; rays += `<line x1="${144+Math.cos(t)*34}" y1="${88+Math.sin(t)*34}" x2="${144+Math.cos(t)*44}" y2="${88+Math.sin(t)*44}"/>`; }
      return `<defs><radialGradient id="${r}" cx="50%" cy="45%" r="60%">
        <stop offset="0" stop-color="#fff3c9"/><stop offset="1" stop-color="#f4ead6"/></radialGradient></defs>
        <rect width="288" height="176" rx="10" fill="url(#${r})"/>
        <g stroke="${a}" stroke-width="2.4" stroke-linecap="round" opacity="0.85">${rays}</g>
        <circle cx="144" cy="88" r="28" fill="#c9a227"/>
        <circle cx="144" cy="88" r="28" fill="none" stroke="${a}" stroke-width="1.6" opacity="0.6"/>`;
    },
    moon(a) {
      const s = g('moon');
      return `<defs><radialGradient id="${s}" cx="35%" cy="35%" r="75%">
        <stop offset="0" stop-color="#1c2340"/><stop offset="1" stop-color="#0c1020"/></radialGradient></defs>
        <rect width="288" height="176" rx="10" fill="url(#${s})"/>
        ${stars([[44,34,1.2],[228,44,1],[120,28,0.9],[196,96,1],[64,110,1.1],[252,120,0.9]])}
        <g transform="translate(150 88)"><circle r="30" fill="#e9e4d4"/><circle r="30" cx="12" cy="-5" fill="#0c1020"/></g>
        ${goldStar(210, 40, 0.7)}`;
    },
    sky(a) { return M.moon(a); },
    cosmos(a) {
      const s = g('cos');
      return `<defs><radialGradient id="${s}" cx="50%" cy="42%" r="72%">
        <stop offset="0" stop-color="#241d3a"/><stop offset="1" stop-color="#0c0a18"/></radialGradient></defs>
        <rect width="288" height="176" rx="10" fill="url(#${s})"/>
        ${stars(Array.from({length:26},()=>[Math.round(Math.random()*268+10),Math.round(Math.random()*156+10),Math.random()*1.3+0.4]))}
        <ellipse cx="144" cy="90" rx="70" ry="26" fill="none" stroke="${a}" stroke-width="1.6" opacity="0.55" transform="rotate(-18 144 90)"/>
        ${goldStar(144, 90, 1.2)}`;
    },
    star(a) {
      return `<rect width="288" height="176" rx="10" fill="#141230"/>
        ${stars([[50,40,1.2],[236,50,1],[110,30,0.9],[200,110,1],[70,124,1.1],[150,150,0.9],[250,140,1]])}
        ${goldStar(144, 84, 1.8)}`;
    },
    egg(a) {
      return `<rect width="288" height="176" rx="10" fill="#141230"/>
        ${stars([[50,40,1],[236,50,1],[110,30,0.9]])}
        <ellipse cx="144" cy="96" rx="34" ry="42" fill="#f2ece0" stroke="${a}" stroke-width="2"/>
        <path d="M118 92 L132 100 L122 112 L138 122" fill="none" stroke="${a}" stroke-width="2" opacity="0.7"/>
        ${goldStar(170, 66, 0.9)}`;
    },
    forest(a) {
      const tree = (x, s) => `<path fill="#5a7d4a" d="M${x} ${150-40*s} L${x-16*s} ${150} L${x+16*s} ${150} Z"/>
        <path fill="#48693b" d="M${x} ${150-58*s} L${x-13*s} ${150-22*s} L${x+13*s} ${150-22*s} Z"/>
        <rect x="${x-2}" y="146" width="4" height="8" fill="#6b5a3e"/>`;
      return `<rect width="288" height="176" rx="10" fill="#eef3e6"/>
        ${goldStar(228, 40, 1)}${stars([[60,32,1]])}
        ${tree(70,1)}${tree(150,1.3)}${tree(220,0.9)}
        <path d="M0 150 h288" stroke="#c9bfa2" stroke-width="1"/>`;
    },
    garden(a) {
      const flower = (x, y, c) => `<circle cx="${x}" cy="${y}" r="6" fill="${c}"/>
        <circle cx="${x}" cy="${y}" r="2.4" fill="#c9a227"/><line x1="${x}" y1="${y+6}" x2="${x}" y2="${y+22}" stroke="#5a7d4a" stroke-width="2"/>`;
      return `<rect width="288" height="176" rx="10" fill="#f3f0e2"/>
        ${M.__sunSmall(a, 224, 40)}
        ${flower(70,110,'#e58aa0')}${flower(120,120,'#e5b45a')}${flower(170,108,'#8ab3e5')}${flower(214,122,'#c58ae5')}
        <path d="M0 150 q60 -8 144 0 t144 0" fill="none" stroke="#5a7d4a" stroke-width="2" opacity="0.5"/>`;
    },
    'door-home'(a) {
      return `<rect width="288" height="176" rx="10" fill="#20213a"/>
        ${stars([[44,34,1],[236,44,1],[120,28,0.9]])}
        <g transform="translate(120 74)"><rect width="48" height="66" rx="6" fill="#f0d79a"/>
        <rect x="6" y="6" width="36" height="54" rx="4" fill="#f7ead0"/><circle cx="38" cy="34" r="2.4" fill="#9a7010"/></g>
        <path d="M120 74 q24 -26 48 0" fill="#f5e6b0"/>
        ${goldStar(200, 50, 0.8)}`;
    },
    boat(a) {
      const s = g('boat');
      return `<defs><linearGradient id="${s}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="#0c5a66"/></linearGradient></defs>
        <rect width="288" height="176" rx="10" fill="#1c2340"/>
        ${stars([[44,30,1],[236,40,1],[120,24,0.9]])}<g transform="translate(150 40)"><circle r="16" fill="#e9e4d4"/></g>
        ${waves(s, a, 118)}
        <g transform="translate(130 96)"><path d="M0 20 q16 -8 32 0 q-16 8 -32 0Z" fill="#e7dcae"/><path d="M14 20 l0 -20 l14 10 Z" fill="#c9a227"/></g>`;
    },
    whale(a) {
      const s = g('wh');
      return `<defs><linearGradient id="${s}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="#0c5a66"/></linearGradient></defs>
        <rect width="288" height="176" rx="10" fill="#0e2a33"/>
        ${stars([[44,30,1],[236,40,1]])}
        <path fill="${a}" opacity="0.9" d="M60 96 Q110 60 176 74 Q206 80 222 68 L240 52 L234 78 L256 92 L228 96 Q200 118 150 114 Q92 110 60 96 Z"/>
        <circle cx="96" cy="88" r="3" fill="#fff"/>${goldStar(210, 40, 0.8)}`;
    },
    companion(a) {
      return `<rect width="288" height="176" rx="10" fill="#eef5f6"/>${stars([[224,30,1]])}
        <g transform="translate(112 56)"><path fill="${a}" d="M32 0 Q64 14 64 48 Q64 82 32 82 Q0 82 0 48 Q0 18 32 0 Z"/>
        <circle cx="22" cy="42" r="8" fill="#fff"/><circle cx="24" cy="44" r="4" fill="#2c2416"/>
        <circle cx="46" cy="42" r="8" fill="#fff"/><circle cx="48" cy="44" r="4" fill="#2c2416"/>
        <path d="M26 62 Q32 68 40 62" fill="none" stroke="#2c2416" stroke-width="2" stroke-linecap="round"/></g>
        ${goldStar(196, 60, 0.9)}`;
    },
    crown(a) {
      return `<rect width="288" height="176" rx="10" fill="#1a1a2e"/>${stars([[50,34,1],[236,44,1],[120,26,0.9]])}
        <g transform="translate(112 74)"><path fill="#4a4a5a" stroke="${a}" stroke-width="1.4" d="M0 40 L0 14 L16 28 L32 8 L48 28 L64 14 L64 40 Z"/>
        <circle cx="32" cy="24" r="3" fill="#c9a227"/></g>${goldStar(210, 46, 0.8)}`;
    },
    __sunSmall(a, x, y) {
      let rays = '';
      for (let i = 0; i < 10; i++) { const t = i / 10 * Math.PI * 2; rays += `<line x1="${x+Math.cos(t)*14}" y1="${y+Math.sin(t)*14}" x2="${x+Math.cos(t)*20}" y2="${y+Math.sin(t)*20}"/>`; }
      return `<g stroke="${a}" stroke-width="1.8" stroke-linecap="round" opacity="0.8">${rays}</g><circle cx="${x}" cy="${y}" r="11" fill="#c9a227"/>`;
    },
  };
  // The motif set is all landscape/fantasy, so indoor and everyday scenes are
  // routed to the nearest human-world art (door-home) rather than falling
  // through to a mountain — otherwise the art quietly pushes every book outdoors.
  const ALIASES = { water: 'sea', ocean: 'sea', wave: 'sea', fire: 'sun', light: 'sun', lamp: 'sun',
    lantern: 'sun', candle: 'sun', night: 'moon',
    creature: 'companion', cat: 'companion', bird: 'companion', animal: 'companion', hero: 'companion',
    family: 'companion', friends: 'companion', crew: 'companion', team: 'companion', game: 'companion',
    ball: 'companion', toy: 'companion', play: 'companion',
    home: 'door-home', door: 'door-home', house: 'door-home', room: 'door-home', bedroom: 'door-home',
    bed: 'door-home', kitchen: 'door-home', table: 'door-home', window: 'door-home', stairs: 'door-home',
    school: 'door-home', street: 'door-home', city: 'door-home', town: 'door-home', village: 'door-home',
    workshop: 'door-home', market: 'door-home',
    tree: 'forest', wood: 'forest', flower: 'garden', field: 'garden' };

  function motifSVG(key, element) {
    uid++;
    const accent = ACCENTS[element] || '#1a9eae';
    const k = M[key] ? key : (ALIASES[key] || 'mountain-sea');
    const inner = (M[k] || M['mountain-sea'])(accent);
    return `<svg viewBox="0 0 288 176" class="ss-art-svg" role="img" aria-label="${(key||'scene').replace(/[<>&"]/g,'')}">${inner}</svg>`;
  }

  function fill(root, element) {
    if (!root) return;
    root.querySelectorAll('figure.art[data-motif]').forEach(f => {
      if (f.dataset.rendered) return;
      f.innerHTML = motifSVG(f.dataset.motif, element);
      f.dataset.rendered = '1';
    });
  }

  return { fill, motifSVG, motifs: () => Object.keys(M).filter(k => !k.startsWith('__')) };
})();
