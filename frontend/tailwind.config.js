/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        ground: 'var(--ground)',
        surface: 'var(--surface)',
        border: 'var(--border)',
        divider: 'var(--divider)',
        'chip-neutral': 'var(--chip-neutral)',
        ink: 'var(--ink)',
        'text-2': 'var(--text-2)',
        muted: 'var(--muted)',
        primary: {
          DEFAULT: 'var(--primary)',
          deep: 'var(--primary-deep)',
        },
        'nav-pill': {
          bg: 'var(--nav-pill-bg)',
          text: 'var(--nav-pill-text)',
        },
        hl: {
          fill: 'var(--hl-fill)',
          border: 'var(--hl-border)',
          'label-bg': 'var(--hl-label-bg)',
          arc: 'var(--hl-arc)',
        },
        blocking: {
          bg: 'var(--blocking-bg)',
          text: 'var(--blocking-text)',
          border: 'var(--blocking-border)',
        },
        warning: {
          bg: 'var(--warning-bg)',
          text: 'var(--warning-text)',
        },
        ok: {
          bg: 'var(--ok-bg)',
          text: 'var(--ok-text)',
        },
        demo: {
          'chip-bg': 'var(--demo-chip-bg)',
          'chip-text': 'var(--demo-chip-text)',
        },
        disabled: {
          bg: 'var(--disabled-bg)',
          text: 'var(--disabled-text)',
        },
        'on-primary-deep': {
          title: 'var(--on-primary-deep-title)',
          body: 'var(--on-primary-deep-body)',
        },
        'ring-track': 'var(--ring-track)',
        'photo-paper': 'var(--photo-paper)',
        'photo-ink': 'var(--photo-ink)',
        'photo-rule': 'var(--photo-rule)',
      },
      fontFamily: {
        sans: ['Inter', 'Noto Sans Devanagari', 'sans-serif'],
        hindi: ['Noto Sans Devanagari', 'Inter', 'sans-serif'],
      },
      fontSize: {
        'page-title': ['18px', { lineHeight: '24px', fontWeight: '700' }],
        body: ['15px', { lineHeight: '22px' }],
        secondary: ['13px', { lineHeight: '18px' }],
        label: ['12px', { lineHeight: '16px' }],
      },
    },
  },
  plugins: [],
}

