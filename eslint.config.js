import eslint from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const restrictedArchitectureImports = [
  '@ui/*',
  '@combat-presentation/*',
  '@platform/*',
  '@bootstrap/*',
];

export default tseslint.config(
  {
    ignores: [
      'assets/**',
      'dist/**',
      'dist-evidence/**',
      'dist-evidence-uninstrumented/**',
      'node_modules/**',
      'playwright-report/**',
      'test-results/**',
      // Transient protocol directory (gitignored): never part of the build or
      // commit; reviewer probes/handoff records there must not fail repository
      // gates.
      '.agent-handoff/**',
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
  {
    files: ['src/domain/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            ...restrictedArchitectureImports,
            '@application/*',
            '@content/*',
            'react',
            'react-dom/*',
            'phaser',
          ],
        },
      ],
    },
  },
  {
    files: ['src/content/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            ...restrictedArchitectureImports,
            '@application/*',
            'react',
            'react-dom/*',
            'phaser',
          ],
        },
      ],
    },
  },
  {
    files: ['src/application/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            ...restrictedArchitectureImports,
            'react',
            'react-dom/*',
            'phaser',
          ],
        },
      ],
    },
  },
  {
    files: ['src/ui/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: ['@content/*', '@combat-presentation/*', 'phaser'] },
      ],
    },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/test-support/**', 'src/**/*.test.ts', 'src/**/*.test.tsx'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            '@test-support',
            '@test-support/*',
            '@test-support/**',
            'assets/source/*',
          ],
        },
      ],
    },
  },
);
