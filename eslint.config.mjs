import js from '@eslint/js';
import globals from 'globals';

const style = {
	curly: 'error',
	eqeqeq: 'error',
	'no-var': 'off',
	quotes: [ 'error', 'single', { avoidEscape: true } ],
	strict: [ 'error', 'function' ]
};

export default [
	{
		ignores: [ 'node_modules/', 'build/', 'flac/', 'libogg/', 'worker/wasm/', 'test-results/', 'playwright-report/' ]
	},
	js.configs.recommended,
	{
		// Classic worker scripts
		files: [ 'worker/**/*.js' ],
		languageOptions: {
			ecmaVersion: 2015,
			sourceType: 'script',
			globals: { ...globals.worker }
		},
		rules: style
	},
	{
		files: [ '**/*.mjs' ],
		languageOptions: {
			ecmaVersion: 'latest',
			sourceType: 'module',
			globals: { ...globals.node, ...globals.browser }
		},
		rules: { ...style, strict: 'off' }
	}
];
