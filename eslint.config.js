import js from '@eslint/js'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}', 'electron/**/*.ts'],
    rules: {
      // 放宽规则 — 项目已有大量代码，逐步收紧
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-empty-function': 'off',
      'no-empty': ['warn', { allowEmptyCatch: true }],
      'prefer-const': 'warn',
    },
  },
  {
    ignores: [
      'dist/**',
      'dist-electron/**',
      'build/**',
      'release/**',
      'node_modules/**',
      'clipper/**',
      'xiaobaixiaobai/**',
    ],
  }
)
