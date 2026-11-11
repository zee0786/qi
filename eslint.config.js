import js from '@eslint/js';
import globals from 'globals';
import react from 'eslint-plugin-react';

const reactFlat = react.configs.flat.recommended;

export default [
  { ignores: ['**/node_modules/**', '**/dist/**', 'backend/uploads/**'] },
  js.configs.recommended,
  {
    files: ['backend/**/*.js', '*.js'],
    languageOptions: { ecmaVersion: 2023, sourceType: 'module', globals: globals.node },
  },
  {
    files: ['frontend/**/*.{js,jsx}'],
    ...reactFlat,
    languageOptions: { ...reactFlat.languageOptions, globals: globals.browser },
    settings: { react: { version: 'detect' } },
    rules: {
      ...reactFlat.rules,
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',
    },
  },
];
