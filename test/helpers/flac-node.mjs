/**
 * Runs the flac.js WebAssembly module (worker/wasm/*.js) in Node.js.
 */
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire( import.meta.url );

export const ROOT = path.resolve( path.dirname( fileURLToPath( import.meta.url ) ), '..', '..' );

const factories = {
	full: require( path.join( ROOT, 'worker/wasm/flac.js' ) ),
	encoder: require( path.join( ROOT, 'worker/wasm/flac.encoder.js' ) )
};

/**
 * Runs the flac command line tool in a fresh runtime.
 *
 * @param {string[]} args Command line arguments
 * @param {Object} [options]
 * @param {Object.<string,Uint8Array>} [options.files] Input files
 * @param {string[]} [options.outputs] Output files to read after flac exited
 * @param {'full'|'encoder'} [options.variant='full']
 * @return {Promise<{exitCode: number, stdout: string, stderr: string,
 *  files: Object.<string,Uint8Array>, progress: number[][]}>}
 */
export async function runFlac( args, { files = {}, outputs = [], variant = 'full' } = {} ) {
	const stdout = [],
		stderr = [],
		progress = [],
		Module = await factories[ variant ]( {
			print: ( s ) => stdout.push( s ),
			printErr: ( s ) => stderr.push( s )
		} );

	Module._flac__utils_set_progress_callback(
		Module.addFunction( ( processed, total, extra ) => progress.push( [ processed, total, extra ] ), 'vddd' )
	);
	for ( const [ name, data ] of Object.entries( files ) ) {
		Module.FS.writeFile( name, data );
	}

	const previousExitCode = process.exitCode,
		exitCode = Module.callMain( args.slice() );
	// Emscripten sets process.exitCode when the program exits under Node.js
	process.exitCode = previousExitCode;

	const out = {};
	for ( const name of outputs ) {
		if ( Module.FS.analyzePath( name ).exists ) {
			out[ name ] = Module.FS.readFile( name );
		}
	}
	return {
		exitCode,
		stdout: stdout.join( '\n' ),
		stderr: stderr.join( '\n' ),
		files: out,
		progress
	};
}

/**
 * @param {Uint8Array} wav
 * @param {string[]} [extraArgs]
 * @param {'full'|'encoder'} [variant]
 * @return {Promise<Uint8Array>} FLAC file
 */
export async function encode( wav, extraArgs = [], variant = 'full' ) {
	const res = await runFlac( [ ...extraArgs, 'in.wav', '-o', 'out.flac' ], {
		files: { 'in.wav': wav },
		outputs: [ 'out.flac' ],
		variant
	} );
	if ( res.exitCode !== 0 ) {
		throw new Error( `flac exited with ${ res.exitCode }:\n${ res.stderr }` );
	}
	return res.files[ 'out.flac' ];
}

/**
 * @param {Uint8Array} flac
 * @param {string[]} [extraArgs]
 * @param {string} [outName]
 * @return {Promise<Uint8Array>} Decoded file
 */
export async function decode( flac, extraArgs = [], outName = 'out.wav' ) {
	const res = await runFlac( [ '-d', ...extraArgs, 'in.flac', '-o', outName ], {
		files: { 'in.flac': flac },
		outputs: [ outName ]
	} );
	if ( res.exitCode !== 0 ) {
		throw new Error( `flac exited with ${ res.exitCode }:\n${ res.stderr }` );
	}
	return res.files[ outName ];
}
