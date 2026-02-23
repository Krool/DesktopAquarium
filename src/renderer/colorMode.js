const LS_KEY = "ascii-reef-color-mode";
let _mode = localStorage.getItem(LS_KEY) || "rarity";

export function getColorMode() { return _mode; }
export function setColorMode(m) { _mode = m; localStorage.setItem(LS_KEY, m); }

// ── Color math ─────────────────────────────────────────────────────────────
function hexToRgb(hex) {
  return [parseInt(hex.slice(1,3),16), parseInt(hex.slice(3,5),16), parseInt(hex.slice(5,7),16)];
}
function rgbToHex(r,g,b) {
  return '#'+[r,g,b].map(v=>Math.max(0,Math.min(255,Math.round(v))).toString(16).padStart(2,'0')).join('');
}
function modulateBrightness(hex, factor) {
  const [r,g,b] = hexToRgb(hex);
  return rgbToHex(r*factor, g*factor, b*factor);
}
function hexToHsl(hex) {
  let [r,g,b] = hexToRgb(hex).map(v=>v/255);
  const max=Math.max(r,g,b), min=Math.min(r,g,b);
  let h,s, l=(max+min)/2;
  if (max===min){h=s=0;}
  else {
    const d=max-min; s=l>0.5?d/(2-max-min):d/(max+min);
    switch(max){case r:h=((g-b)/d+(g<b?6:0))/6;break;case g:h=((b-r)/d+2)/6;break;default:h=((r-g)/d+4)/6;}
  }
  return [h*360, s*100, l*100];
}
function hslToHex(h,s,l) {
  h/=360;s/=100;l/=100;
  const q=l<0.5?l*(1+s):l+s-l*s, p=2*l-q;
  const f=(p,q,t)=>{if(t<0)t+=1;if(t>1)t-=1;if(t<1/6)return p+(q-p)*6*t;if(t<1/2)return q;if(t<2/3)return p+(q-p)*(2/3-t)*6;return p;};
  return rgbToHex(f(p,q,h+1/3)*255, f(p,q,h)*255, f(p,q,h-1/3)*255);
}
function shiftHue(hex, deg) {
  const [h,s,l]=hexToHsl(hex); return hslToHex((h+deg)%360,s,l);
}

// ── Per-character color resolver ────────────────────────────────────────────
// ch: the character; rowIdx/colIdx: position within sprite frame
// totalRows: sprite.height; sprite: parsed sprite def; timestamp: ms
export function getNaturalColor(ch, rowIdx, colIdx, totalRows, sprite, timestamp) {
  const base = sprite.naturalColor     || "#AABBCC";
  const alt  = sprite.naturalColorAlt  || null;
  const eye  = sprite.naturalColorEye  || null;
  const anim = sprite.naturalAnim      || null;
  const t    = timestamp / 1000;

  // Eye characters always get eye color when defined
  if (eye && (ch === 'o' || ch === 'O')) return eye;

  // Edge rows (fins/belly) get alt color on multi-row sprites
  let color = base;
  if (alt && totalRows > 1 && (rowIdx === 0 || rowIdx === totalRows - 1)) {
    color = alt;
  }

  // Animation modulates the resolved color
  switch (anim) {
    case "shimmer": {
      const f = 0.86 + 0.14 * Math.sin(t * 2.1 + colIdx * 0.25);
      return modulateBrightness(color, f);
    }
    case "iridescent": {
      const deg = (t * 18 + colIdx * 12) % 360;
      return shiftHue(color, deg);
    }
    case "pulse": {
      const f = 0.72 + 0.28 * Math.sin(t * 2.8);
      return modulateBrightness(color, f);
    }
  }
  return color;
}
