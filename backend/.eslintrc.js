module.exports = {
  env: {
    node: true,
    es2021: true,
    jest: true,
  },
  extends: [
    'airbnb-base',
  ],
  parserOptions: {
    ecmaVersion: 12,
    sourceType: 'module',
  },
  rules: {
    // Customize rules as needed
    'no-console': 'warn',
    'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    'consistent-return': 'off',
    'no-param-reassign': 'off',
    'max-len': ['error', { code: 120 }],
    'import/no-extraneous-dependencies': ['error', { devDependencies: true }],
    'class-methods-use-this': 'off',
    'no-underscore-dangle': 'off',
    'arrow-body-style': 'off',
    'prefer-arrow-callback': 'off',
  },
  overrides: [
    {
      files: ['**/*.test.js', '**/*.spec.js'],
      env: {
        jest: true,
      },
      rules: {
        'no-undef': 'off',
      },
    },
  ],
};