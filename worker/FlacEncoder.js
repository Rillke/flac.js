/*!
 * Copyright © 2014 Rainer Rillke <lastname>@wikipedia.de
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to
 * deal in the Software without restriction, including without limitation the
 * rights to use, copy, modify, merge, publish, distribute, sublicense, and/or
 * sell copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
 * FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS
 * IN THE SOFTWARE.
 */

/* global createFlacModule */
( function ( global ) {
	'use strict';

	var SCRIPT = 'wasm/flac.js',
		WASM = 'wasm/flac.wasm.png',
		wasmModulePromise = null,
		FlacEncoder;

	function postLog( reply, args ) {
		global.postMessage( {
			reply: reply,
			values: args
		} );
	}

	/**
	 * Fetches and compiles the WebAssembly binary once per worker so that
	 * subsequent encode commands do not need to download or compile it again.
	 *
	 * The binary is stored with a .png suffix and therefore usually served
	 * with an image/png MIME type, which rules out
	 * WebAssembly.compileStreaming().
	 *
	 * @return {Promise<WebAssembly.Module>}
	 */
	function compileWasm() {
		if ( !wasmModulePromise ) {
			wasmModulePromise = fetch( WASM ).then( function ( response ) {
				if ( !response.ok ) {
					throw new Error( 'Failed to download ' + WASM + ': HTTP ' + response.status );
				}
				return response.arrayBuffer();
			} ).then( function ( buffer ) {
				return WebAssembly.compile( buffer );
			} );
			// Allow retrying after failures
			wasmModulePromise.catch( function () {
				wasmModulePromise = null;
			} );
		}
		return wasmModulePromise;
	}

	function loadScript() {
		if ( typeof global.createFlacModule !== 'function' ) {
			global.importScripts( SCRIPT );
		}
	}

	/**
	 * Manages encoding and progress notifications
	 *
	 * @class FlacEncoder
	 * @singleton
	 */
	FlacEncoder = global.FlacEncoder = {
		/**
		 * Runs the flac command line tool with the supplied arguments and
		 * input files and posts the requested output files back.
		 *
		 * A new runtime is instantiated for each invocation, so a worker can
		 * be used to process multiple files one after another.
		 *
		 * @param {Object} data
		 * @param {string[]} data.args Command line arguments
		 * @param {Object.<string,Uint8Array>} data.fileData Input files
		 * @param {Object.<string,Object>} data.outData Output files to read
		 *  after flac completed; keys are file names, values have a MIME
		 *  property
		 * @return {Promise} Resolved when the reply has been posted
		 */
		encode: function ( data ) {
			var log = data.log || FlacEncoder.log,
				err = data.err || FlacEncoder.err;

			if ( typeof WebAssembly !== 'object' ) {
				err( [ 'WebAssembly is not supported by this browser.' ] );
				return Promise.resolve( FlacEncoder.failed( data, 1 ) );
			}

			return compileWasm().then( function ( wasmModule ) {
				loadScript();
				return new Promise( function ( resolve, reject ) {
					createFlacModule( {
						print: function ( text ) {
							log( [ text ] );
						},
						printErr: function ( text ) {
							err( [ text ] );
						},
						// Instantiate the module compiled by compileWasm()
						instantiateWasm: function ( imports, receiveInstance ) {
							WebAssembly.instantiate( wasmModule, imports ).then( function ( instance ) {
								receiveInstance( instance, wasmModule );
							}, reject );
							return {};
						}
					} ).then( resolve, reject );
				} );
			} ).then( function ( Module ) {
				return FlacEncoder.run( Module, data );
			} ).catch( function ( e ) {
				err( [ String( e && e.message || e ) ] );
				return FlacEncoder.failed( data, 1 );
			} );
		},

		/**
		 * Downloads and compiles the WebAssembly binary in advance.
		 *
		 * @return {Promise}
		 */
		prefetch: function () {
			return compileWasm().then( loadScript ).catch( function ( e ) {
				FlacEncoder.err( [ String( e && e.message || e ) ] );
			} );
		},

		run: function ( Module, data ) {
			/* eslint-disable no-prototype-builtins */
			var progress = data.progress || FlacEncoder.progress,
				exitCode, filename, fPointer;

			fPointer = Module.addFunction( function ( processed, total, extra ) {
				progress( [ processed, total, extra ] );
			}, 'vddd' );
			Module._flac__utils_set_progress_callback( fPointer );

			// Create all necessary files in MEMFS
			// Do NOT create output files ... (Warning: Output file already exists ...)
			for ( filename in data.fileData ) {
				if ( data.fileData.hasOwnProperty( filename ) ) {
					Module.FS.writeFile( filename, data.fileData[ filename ] );
				}
			}

			try {
				exitCode = Module.callMain( data.args.slice( 0 ) );
			} catch ( e ) {
				// exit() was called, e.g. by die(); callMain() usually handles
				// this but be defensive
				exitCode = e && typeof e.status === 'number' ? e.status : 1;
				if ( !( e && e.name === 'ExitStatus' ) ) {
					( data.err || FlacEncoder.err )( [ String( e && e.message || e ) ] );
				}
			}

			if ( exitCode !== 0 ) {
				return FlacEncoder.failed( data, exitCode, Module );
			}

			// Read output files
			for ( filename in data.outData ) {
				if ( data.outData.hasOwnProperty( filename ) ) {
					data.outData[ filename ].blob = new Blob(
						[ Module.FS.readFile( filename ) ],
						{ type: data.outData[ filename ].MIME }
					);
				}
			}
			( data.done || FlacEncoder.done )( data.outData );
		},

		/**
		 * Reports that flac exited with an error. Output files that were
		 * created anyway are attached.
		 *
		 * @param {Object} data
		 * @param {number} exitCode
		 * @param {Object} [Module]
		 */
		failed: function ( data, exitCode, Module ) {
			/* eslint-disable no-prototype-builtins */
			var filename;

			if ( Module ) {
				for ( filename in data.outData ) {
					if ( data.outData.hasOwnProperty( filename ) && Module.FS.analyzePath( filename ).exists ) {
						data.outData[ filename ].blob = new Blob(
							[ Module.FS.readFile( filename ) ],
							{ type: data.outData[ filename ].MIME }
						);
					}
				}
			}
			( data.failed || FlacEncoder.postFailed )( exitCode, data.outData );
		},

		done: function ( outData ) {
			global.postMessage( {
				reply: 'done',
				values: outData
			} );
		},

		postFailed: function ( exitCode, outData ) {
			global.postMessage( {
				reply: 'failed',
				exitCode: exitCode,
				values: outData
			} );
		},

		progress: function ( args ) {
			postLog( 'progress', args );
		},

		log: function ( args ) {
			postLog( 'log', args );
		},

		err: function ( args ) {
			postLog( 'err', args );
		}
	};

}( self ) );
