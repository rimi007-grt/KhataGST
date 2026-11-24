/**
 * KhataGST Design Token WCAG Contrast Check Script
 * Target: 4.5:1 for text (Level AA), 3.0:1 for graphics / UI components
 */

function hexToRgb(hex) {
  let cleaned = hex.replace('#', '').trim();
  if (cleaned.length === 3) {
    cleaned = cleaned.split('').map(c => c + c).join('');
  }
  const num = parseInt(cleaned, 16);
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255
  };
}

function getLuminance({ r, g, b }) {
  const a = [r, g, b].map(v => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];
}

function getContrastRatio(hex1, hex2) {
  const lum1 = getLuminance(hexToRgb(hex1));
  const lum2 = getLuminance(hexToRgb(hex2));
  const brightest = Math.max(lum1, lum2);
  const darkest = Math.min(lum1, lum2);
  return (brightest + 0.05) / (darkest + 0.05);
}

const TOKEN_PAIRS = [
  { name: '--ink on --ground', fg: '#2A211C', bg: '#E5E4E2', target: 4.5, type: 'text' },
  { name: '--ink on --surface', fg: '#2A211C', bg: '#F6F6F5', target: 4.5, type: 'text' },
  { name: '--text-2 on --surface', fg: '#3D342E', bg: '#F6F6F5', target: 4.5, type: 'text' },
  { name: '--muted on --surface', fg: '#5E5650', bg: '#F6F6F5', target: 4.5, type: 'text' },
  { name: 'white on --primary', fg: '#FFFFFF', bg: '#6F4E37', target: 4.5, type: 'text' },
  { name: '--on-primary-deep-title on --primary-deep', fg: '#FFFDF7', bg: '#3E2A1D', target: 4.5, type: 'text' },
  { name: '--on-primary-deep-body on --primary-deep', fg: '#E6DDD5', bg: '#3E2A1D', target: 4.5, type: 'text' },
  { name: '--nav-pill-text on --nav-pill-bg', fg: '#4E3424', bg: '#E3D6CB', target: 4.5, type: 'text' },
  { name: '--blocking-text on --blocking-bg', fg: '#A8182B', bg: '#F8DCE0', target: 4.5, type: 'text' },
  { name: '--warning-text on --warning-bg', fg: '#6B5400', bg: '#F3E9B8', target: 4.5, type: 'text' },
  { name: '--ok-text on --ok-bg', fg: '#0B5E3A', bg: '#D6F0E2', target: 4.5, type: 'text' },
  { name: '--demo-chip-text on --demo-chip-bg', fg: '#F5F4F2', bg: '#2B2623', target: 4.5, type: 'text' },
  { name: '--disabled-text on --disabled-bg', fg: '#4F4943', bg: '#D0CFCD', target: 3.0, type: 'ui' },
  { name: '--hl-label-bg text on bg (white)', fg: '#FFFFFF', bg: '#5B4B9A', target: 4.5, type: 'text' },
];

console.log('='.repeat(70));
console.log('KhataGST WCAG Contrast Compliance Audit (UI_SPEC.md)');
console.log('='.repeat(70));

let failures = 0;

for (const pair of TOKEN_PAIRS) {
  const ratio = getContrastRatio(pair.fg, pair.bg);
  const roundedRatio = Math.round(ratio * 100) / 100;
  const passed = ratio >= pair.target;

  const status = passed ? 'PASS' : 'FAIL';
  console.log(
    `[${status}] ${pair.name.padEnd(40)}: ${roundedRatio.toFixed(2)}:1 (required: ${pair.target}:1 [${pair.type}])`
  );

  if (!passed) {
    failures++;
  }
}

console.log('='.repeat(70));
if (failures === 0) {
  console.log('All token pairs pass WCAG contrast targets!');
  process.exit(0);
} else {
  console.error(`Audit failed: ${failures} token pair(s) do not meet WCAG targets.`);
  process.exit(1);
}

