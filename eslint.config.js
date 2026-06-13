import eslint from '@eslint/js'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/restrict-template-expressions': 'off',
      // TODO: re-enable after Phase 3 when async stubs are implemented
      '@typescript-eslint/require-await': 'off',
      // RawfyError is a structured object (not extending Error) by design.
      // See workflow.md error handling convention.
      '@typescript-eslint/only-throw-error': 'off',
    },
  },
  { ignores: ['dist/', 'node_modules/', '*.config.*'] },
)
