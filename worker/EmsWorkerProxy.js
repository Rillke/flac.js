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

/* global FlacEncoder */
( function ( global ) {
	'use strict';

	function loadEncoder() {
		if ( !global.FlacEncoder ) {
			global.importScripts( 'FlacEncoder.js' );
		}
	}

	/**
	 * Worker proxy implementing communication between worker and website
	 *
	 * @class EmsWorkerProxy
	 * @singleton
	 */
	global.EmsWorkerProxy = {
		init: function () {
			// Encode commands are processed one after another
			var queue = Promise.resolve();

			global.onmessage = function ( e ) {
				switch ( e.data.command ) {
					case 'ping':
						global.postMessage( { reply: 'pong' } );
						break;
					case 'encode':
						loadEncoder();
						queue = queue.then( function () {
							return FlacEncoder.encode( e.data );
						} );
						break;
					case 'prefetch':
						loadEncoder();
						FlacEncoder.prefetch( e.data );
						break;
				}
			};
		}
	};
	global.EmsWorkerProxy.init();

}( self ) );
