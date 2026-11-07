/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
    theme: {
    fontSize: {
      '12': ['0.75rem', { lineHeight: '1rem' }],
      '13': ['0.8125rem', { lineHeight: '1.25rem' }],
      '14': ['0.875rem', { lineHeight: '1.4rem' }],
      '16': ['1rem', { lineHeight: '1.6rem' }],
      '18': ['1.125rem', { lineHeight: '1.8rem' }],
      '20': ['1.25rem', { lineHeight: '1.75rem' }],
      '24': ['1.5rem', { lineHeight: '1.9rem' }],
    },
    container: {
      center: true,
      padding: '2rem',
      screens: {
        '2xl': '1400px',
      },
    },
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        success: {
          DEFAULT: 'hsl(var(--success))',
          soft: 'hsl(var(--success-soft))',
        },
        warning: {
          DEFAULT: 'hsl(var(--warning))',
          soft: 'hsl(var(--warning-soft))',
        },
        info: {
          DEFAULT: 'hsl(var(--info))',
          soft: 'hsl(var(--info-soft))',
        },
        // 九职能色彩编码（refine-skill-cards-wizard T1）：键名与 SkillFunction 一一对应，
        // 用法见 components/skills/skill-colors.ts 的固定类名映射（不使用动态拼接，避免 JIT 漏扫）
        fn: {
          coding: 'hsl(var(--fn-coding))',
          writing: 'hsl(var(--fn-writing))',
          browser: 'hsl(var(--fn-browser))',
          data: 'hsl(var(--fn-data))',
          devops: 'hsl(var(--fn-devops))',
          'ai-integration': 'hsl(var(--fn-ai))',
          design: 'hsl(var(--fn-design))',
          workflow: 'hsl(var(--fn-workflow))',
          other: 'hsl(var(--fn-other))',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};
