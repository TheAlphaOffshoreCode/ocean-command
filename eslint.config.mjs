import nextCoreWebVitals from 'eslint-config-next/core-web-vitals'
import nextTypescript from 'eslint-config-next/typescript'

/**
 * The rules below are not style preferences — each one enforces an architectural
 * boundary that this project would otherwise have to defend in code review
 * forever. See docs/ARCHITECTURE.md §3.2.
 */
const config = [
  {
    ignores: ['.next/**', 'node_modules/**', 'next-env.d.ts', 'prisma/migrations/**'],
  },

  ...nextCoreWebVitals,
  ...nextTypescript,

  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': ['warn', { prefer: 'type-imports' }],
      'react/no-danger': 'error',
      eqeqeq: ['error', 'smart'],
      'no-console': ['warn', { allow: ['warn', 'error'] }],

      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@prisma/client',
              importNames: ['PrismaClient'],
              message:
                'Instantiating Prisma outside src/lib/db bypasses tenant scoping. Use forTenant(ctx). Types and enums from this package are fine.',
            },
            {
              name: '@/lib/db/client',
              message:
                'The raw client cannot filter by organization. Use forTenant(ctx) from @/lib/db/tenant.',
            },
          ],
        },
      ],
    },
  },

  {
    // The data layer itself, the seed and the tests are what construct clients.
    files: ['src/lib/db/**', 'src/lib/auth/**', 'prisma/**', 'tests/**'],
    rules: {
      'no-restricted-imports': 'off',
      'no-console': 'off',
    },
  },
]

export default config
