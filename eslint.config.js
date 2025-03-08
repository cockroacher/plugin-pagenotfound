import js from '@eslint/js';
import prettier from 'eslint-config-prettier';

export default [
  {
    ignores: ['node_modules/**', 'dist/**']
  },
  js.configs.recommended,
  {
    files: ['**/*.js', '**/*.jsx'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module'
    },
    plugins: {
      prettier
    },
    rules: {
      'prettier/prettier': 'error',
      'no-unused-vars': 'warn',
      'no-console': 'off'
    }
  }
];