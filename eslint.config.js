import js from '@eslint/js';
import tseslint from 'typescript-eslint';

/**
 * Las reglas de docs/09 §2 no son un acuerdo de caballeros: si core/ toca el DOM o alguien
 * llama a Math.random() fuera de rng.ts, la build se rompe. Eso es lo que hace que las
 * promesas del proyecto (determinismo, pureza, cero telemetría) sean verificables.
 */

const NO_AMBIENT_RANDOMNESS = [
  {
    selector: "CallExpression[callee.object.name='Math'][callee.property.name='random']",
    message: 'Math.random() está prohibido. El azar entra por una semilla: usa core/rng.ts.',
  },
  {
    selector: "NewExpression[callee.name='Date'][arguments.length=0]",
    message: 'new Date() está prohibido. La fecha entra por services/clock.ts.',
  },
  {
    selector: "CallExpression[callee.object.name='Date'][callee.property.name='now']",
    message: 'Date.now() está prohibido. La fecha entra por services/clock.ts.',
  },
];

const PURE_LAYER_IMPORTS = {
  patterns: [
    {
      group: ['@capacitor/*', 'preact', 'preact/*', '@preact/*', 'idb'],
      message: 'core/ y meta/ son puros: sin Preact, sin Capacitor, sin IndexedDB.',
    },
    {
      group: ['**/ui/**', '**/app/**', '**/services/**', '@ui/*', '@app/*', '@services/*'],
      message: 'Las dependencias sólo apuntan hacia abajo (docs/02 §2).',
    },
  ],
};

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'android/**',
      'node_modules/**',
      'coverage/**',
      'assets/**',
      'public/**',
      'eslint.config.js',
      'scripts/*.mjs',
      '.tmp/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/switch-exhaustiveness-check': [
        'error',
        { considerDefaultExhaustiveForUnions: true },
      ],
      '@typescript-eslint/no-unnecessary-condition': 'off',
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
      eqeqeq: ['error', 'always'],
      'no-restricted-syntax': ['error', ...NO_AMBIENT_RANDOMNESS],
    },
  },
  {
    // El núcleo puro: ni una línea de DOM, de Capacitor o de Preact.
    files: ['src/core/**/*.ts', 'src/meta/**/*.ts'],
    languageOptions: {
      globals: {}, // sin window, sin document: usarlos es un error de "no-undef" vía TS
    },
    rules: {
      'no-restricted-imports': ['error', PURE_LAYER_IMPORTS],
      'no-restricted-globals': [
        'error',
        { name: 'window', message: 'core/ y meta/ no conocen el DOM (docs/02 §2).' },
        { name: 'document', message: 'core/ y meta/ no conocen el DOM (docs/02 §2).' },
        { name: 'localStorage', message: 'La persistencia vive en services/.' },
        { name: 'fetch', message: 'core/ y meta/ no hablan con la red. Nada lo hace.' },
      ],
    },
  },
  {
    // Las dos únicas excepciones del proyecto, y están documentadas.
    files: ['src/core/rng.ts', 'src/services/clock.ts', 'scripts/**/*.ts'],
    rules: { 'no-restricted-syntax': 'off' },
  },
  {
    files: ['tests/**/*.ts', 'tests/**/*.tsx', 'scripts/**/*.ts'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
    },
  },
);
