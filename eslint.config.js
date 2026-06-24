import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: {
      // Allow `const { _omit, ...rest } = obj` to drop keys without flagging the
      // intentionally-discarded siblings (used by lib/odds.js strip()).
      'no-unused-vars': ['error', { ignoreRestSiblings: true }],
    },
  },
  // Server-side modules (Vercel functions + the data pipeline) run in Node, not the
  // browser, so they may reference `process` and other Node globals.
  {
    files: ['lib/**/*.js', 'api/**/*.js'],
    languageOptions: { globals: globals.node },
  },
])
