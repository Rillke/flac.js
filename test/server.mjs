/**
 * Minimal static file server for the browser tests and for trying the demo.
 *
 * Usage: node test/server.mjs [port]
 *
 * *.wasm.png files are deliberately served as image/png, as a typical web
 * server would, to make sure flac.js copes with the "wrong" MIME type.
 */
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve( path.dirname( fileURLToPath( import.meta.url ) ), '..' ),
	PORT = Number( process.argv[ 2 ] || process.env.PORT || 8080 ),
	TYPES = {
		'.html': 'text/html; charset=utf-8',
		'.js': 'text/javascript; charset=utf-8',
		'.mjs': 'text/javascript; charset=utf-8',
		'.css': 'text/css; charset=utf-8',
		'.json': 'application/json',
		'.png': 'image/png',
		'.wasm': 'application/wasm'
	};

http.createServer( async ( req, res ) => {
	const url = new URL( req.url, 'http://localhost' ),
		file = path.join( ROOT, path.normalize( decodeURIComponent( url.pathname ) ) );

	if ( !file.startsWith( ROOT + path.sep ) ) {
		res.writeHead( 403 ).end();
		return;
	}
	try {
		const body = await fs.readFile( file.endsWith( path.sep ) ? path.join( file, 'index.html' ) : file );
		res.writeHead( 200, {
			'Content-Type': TYPES[ path.extname( file ) ] || 'application/octet-stream',
			'Cache-Control': 'no-store'
		} ).end( body );
	} catch {
		res.writeHead( 404 ).end( 'Not found' );
	}
} ).listen( PORT, '127.0.0.1', () => {
	console.log( `Serving ${ ROOT } at http://127.0.0.1:${ PORT }/` );
} );
